import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { v } from "../security/validate.js";
import { AppError, friendlyError } from "../security/errors.js";
import { sanitizeFileName, uniqueName } from "../security/paths.js";
import { createBackup, pruneBackups } from "../services/database.js";
import {
  NOTE_FORMATS,
  noteToHtmlDocument,
  writeFileAtomic,
  buildBackup,
  backupFileName,
  dirOrNull,
} from "../services/exporter.js";
import {
  parseBackup,
  applyBackup,
  MAX_IMPORT_BYTES,
} from "../services/importer.js";
import { removeStoredFiles } from "../services/attachments.js";
import { markdownToHtml, plainTextToHtml } from "../services/htmlUtils.js";

const FORMATS = ["txt", "md", "json", "pdf"];
const MAX_TEXT_IMPORT = 5 * 1024 * 1024;

export function registerFileHandlers(handle, ctx) {
  const { repo, paths, dialogs, renderPdf } = ctx;
  const stash = new Map(); // token -> parsed backup (kept in main, never sent to the renderer)

  function defaultDir() {
    return dirOrNull(repo.getSettings().exportDir) ?? ctx.documentsDir();
  }

  async function renderNote(note, format) {
    if (format === "pdf")
      return { ext: "pdf", data: await renderPdf(noteToHtmlDocument(note)) };
    const f = NOTE_FORMATS[format];
    return { ext: f.ext, data: f.render(note) };
  }

  handle("files:exportNote", async (p) => {
    const { id, format } = v.obj(p);
    v.oneOf(format, FORMATS, "format");
    const note = repo.getNote(id);
    const base = sanitizeFileName(note.title, "Untitled note");
    const target = await dialogs.save({
      title: "Export note",
      defaultPath: path.join(defaultDir(), `${base}.${format}`),
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!target) return { canceled: true };
    const { data } = await renderNote(note, format);
    await writeFileAtomic(target, data);
    return { canceled: false, count: 1 };
  });

  handle("files:exportNotes", async (p) => {
    const { ids, format } = v.obj(p);
    v.oneOf(format, FORMATS, "format");
    v.arr(ids, { name: "ids", max: 2000 }).forEach((i) => v.id(i));
    if (ids.length === 0)
      throw new AppError("EVALIDATION", "No notes selected.");
    const dir = await dialogs.openDirectory({
      title: "Export selected notes to…",
      defaultPath: defaultDir(),
    });
    if (!dir) return { canceled: true };
    const taken = new Set();
    let count = 0;
    const failed = [];
    for (const id of ids) {
      try {
        const note = repo.getNote(id);
        const name = uniqueName(
          sanitizeFileName(note.title, "Untitled note"),
          format,
          taken,
        );
        const { data } = await renderNote(note, format);
        await writeFileAtomic(path.join(dir, name), data);
        count += 1;
      } catch (err) {
        failed.push(friendlyError(err).message);
      }
    }
    return { canceled: false, count, failed };
  });

  handle("files:exportBackup", async () => {
    const target = await dialogs.save({
      title: "Export all notes (backup)",
      defaultPath: path.join(defaultDir(), backupFileName()),
      filters: [{ name: "Desktop Notes backup", extensions: ["json"] }],
    });
    if (!target) return { canceled: true };
    const { backup, warnings } = await buildBackup(repo, paths.attachmentsDir);
    await writeFileAtomic(target, JSON.stringify(backup));
    return { canceled: false, notes: backup.notes.length, warnings };
  });

  handle("files:importPreview", async () => {
    const [file] = await dialogs.openFiles({
      title: "Import backup",
      multi: false,
      filters: [{ name: "Desktop Notes backup", extensions: ["json"] }],
    });
    if (!file) return { canceled: true };
    const st = await fs.promises.stat(file).catch((e) => {
      throw friendlyError(e);
    });
    if (!st.isFile()) throw new AppError("EINVALID", "Please choose a file.");
    if (st.size > MAX_IMPORT_BYTES)
      throw new AppError("ETOOBIG", "The backup file is too large to import.");
    const text = await fs.promises.readFile(file, "utf8").catch((e) => {
      throw friendlyError(e);
    });
    const parsed = parseBackup(text, repo);
    if (!parsed.ok) return { canceled: false, ok: false, error: parsed.error };
    const token = randomUUID();
    stash.clear(); // only one pending import at a time
    stash.set(token, parsed.backup);
    return {
      canceled: false,
      ok: true,
      token,
      report: parsed.report,
      fileName: path.basename(file),
    };
  });

  handle("files:importApply", async (p) => {
    const { token, mode } = v.obj(p);
    v.id(token, "token");
    v.oneOf(mode, ["skip", "overwrite"], "mode");
    const backup = stash.get(token);
    if (!backup)
      throw new AppError(
        "EEXPIRED",
        "The import preview expired. Please choose the file again.",
      );
    // Safety net: snapshot the current database before importing.
    const safety = createBackup(ctx.db, paths.backupDir, "before-import");
    pruneBackups(paths.backupDir, 10);
    const result = await applyBackup({
      repo,
      attachmentsDir: paths.attachmentsDir,
      backup,
      mode,
    });
    stash.delete(token);
    await removeStoredFiles(paths.attachmentsDir, result.oldFiles);
    return {
      importedNotes: result.importedNotes,
      skippedNotes: result.skippedNotes,
      newFolders: result.newFolders,
      importedBoards: result.importedBoards,
      attachments: result.attachments,
      safetyBackup: path.basename(safety),
    };
  });

  handle("files:importTextFiles", async (p = {}) => {
    const { folderId = null } = v.obj(p);
    const files = await dialogs.openFiles({
      title: "Import text or Markdown files",
      filters: [{ name: "Text and Markdown", extensions: ["txt", "md"] }],
    });
    const created = [];
    const failed = [];
    for (const file of files) {
      const name = path.basename(file);
      try {
        const ext = path.extname(file).slice(1).toLowerCase();
        if (ext !== "txt" && ext !== "md")
          throw new AppError(
            "ETYPE",
            "Only .txt and .md files can be imported.",
          );
        const st = await fs.promises.stat(file);
        if (!st.isFile() || st.size > MAX_TEXT_IMPORT)
          throw new AppError("ETOOBIG", "The file is too large (max 5 MB).");
        const text = await fs.promises.readFile(file, "utf8");
        if (text.includes("\u0000"))
          throw new AppError("ETYPE", "This does not look like a text file.");
        const html =
          ext === "md" ? markdownToHtml(text) : plainTextToHtml(text);
        const title = path.basename(file, path.extname(file)).slice(0, 300);
        created.push(
          repo.createNote({ folderId, title, contentHtml: html }).id,
        );
      } catch (err) {
        failed.push({ name, reason: friendlyError(err).message });
      }
    }
    return { created, failed };
  });

  handle("files:saveImage", async (p) => {
    const { dataUrl, name = "drawing" } = v.obj(p);
    v.str(dataUrl, { name: "image", max: 80_000_000 });
    const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!m)
      throw new AppError("EVALIDATION", "The image data is not a valid PNG.");
    const buf = Buffer.from(m[1], "base64");
    if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47)
      throw new AppError("EVALIDATION", "The image data is not a valid PNG.");
    const target = await dialogs.save({
      title: "Export drawing as image",
      defaultPath: path.join(
        defaultDir(),
        `${sanitizeFileName(v.str(name, { max: 100 }), "drawing")}.png`,
      ),
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    if (!target) return { canceled: true };
    await writeFileAtomic(target, buf);
    return { canceled: false };
  });
}
