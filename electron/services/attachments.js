import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { AppError, friendlyError } from "../security/errors.js";
import { safeJoin, extOf } from "../security/paths.js";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// Only these extensions can be attached. Executables and scripts are not here.
export const ALLOWED_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  zip: "application/zip",
};

// The first bytes of a real file identify its format ("magic numbers").
const MAGIC = {
  png: (b) =>
    b.length > 8 && b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG",
  jpg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => MAGIC.jpg(b),
  gif: (b) => b.toString("latin1", 0, 4) === "GIF8",
  webp: (b) =>
    b.length > 12 &&
    b.toString("latin1", 0, 4) === "RIFF" &&
    b.toString("latin1", 8, 12) === "WEBP",
  bmp: (b) => b.toString("latin1", 0, 2) === "BM",
  pdf: (b) => b.toString("latin1", 0, 5) === "%PDF-",
  zip: (b) => b.toString("latin1", 0, 2) === "PK",
  docx: (b) => MAGIC.zip(b),
  xlsx: (b) => MAGIC.zip(b),
  pptx: (b) => MAGIC.zip(b),
  odt: (b) => MAGIC.zip(b),
};

const TEXT_TYPES = new Set(["txt", "md", "csv", "json"]);

export function sniffOk(ext, head) {
  if (MAGIC[ext]) return MAGIC[ext](head);
  if (TEXT_TYPES.has(ext)) return !head.includes(0); // text files contain no NUL bytes
  return false;
}

export function mimeForExt(ext) {
  return ALLOWED_TYPES[ext] ?? null;
}

// Validate a file chosen by the user in the native dialog.
export async function validateFile(filePath) {
  let st;
  try {
    st = await fs.promises.stat(filePath);
  } catch (err) {
    throw friendlyError(err);
  }
  if (!st.isFile())
    throw new AppError("EINVALID", "Only regular files can be attached.");
  if (st.size === 0) throw new AppError("EINVALID", "The file is empty.");
  if (st.size > MAX_ATTACHMENT_BYTES) {
    throw new AppError(
      "ETOOBIG",
      `The file is larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`,
    );
  }
  const ext = extOf(filePath);
  const mime = mimeForExt(ext);
  if (!mime)
    throw new AppError(
      "ETYPE",
      `".${ext || "?"}" files are not supported as attachments.`,
    );
  const fh = await fs.promises.open(filePath, "r");
  try {
    const head = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(head, 0, 4096, 0);
    if (!sniffOk(ext, head.subarray(0, bytesRead))) {
      throw new AppError(
        "ETYPE",
        `The content does not look like a real .${ext} file.`,
      );
    }
  } finally {
    await fh.close();
  }
  return { ext, mime, size: st.size };
}

// Copy chosen files into the attachments directory and record them.
// Returns { added, failed }. One bad file never blocks the others.
export async function addFiles({ repo, attachmentsDir, noteId, paths }) {
  repo.getNote(noteId); // throws ENOTFOUND for unknown notes
  await fs.promises.mkdir(attachmentsDir, { recursive: true });
  const added = [];
  const failed = [];
  for (const src of paths) {
    const name = path.basename(src);
    try {
      const { ext, mime, size } = await validateFile(src);
      const storedName = `${randomUUID()}.${ext}`;
      const dest = safeJoin(attachmentsDir, storedName);
      await fs.promises.copyFile(src, dest, fs.constants.COPYFILE_EXCL);
      try {
        const id = repo.addAttachment({
          noteId,
          originalName: name.slice(0, 200),
          storedName,
          mime,
          size,
        });
        added.push(id);
      } catch (err) {
        await fs.promises.rm(dest, { force: true });
        throw err;
      }
    } catch (err) {
      failed.push({
        name,
        reason: friendlyError(err, "Could not attach this file.").message,
      });
    }
  }
  return { added, failed };
}

export async function removeStoredFiles(attachmentsDir, storedNames) {
  for (const n of storedNames) {
    try {
      await fs.promises.rm(safeJoin(attachmentsDir, n), { force: true });
    } catch {
      /* best effort */
    }
  }
}

// Absolute path of an attachment, or throws. The id comes from the renderer,
// the path never does.
export function resolveAttachmentPath(repo, attachmentsDir, id) {
  const row = repo.getAttachmentRow(id);
  const full = safeJoin(attachmentsDir, row.stored_name);
  if (!fs.existsSync(full))
    throw new AppError("EMISSING", "The attachment file is missing from disk.");
  return { full, row };
}

export function withMissingFlags(repo, attachmentsDir, noteId) {
  return repo.listAttachments(noteId).map((a) => {
    const row = repo.getAttachmentRow(a.id);
    return {
      ...a,
      missing: !fs.existsSync(safeJoin(attachmentsDir, row.stored_name)),
    };
  });
}
