import { randomUUID } from "node:crypto";
import { AppError, ValidationError } from "../security/errors.js";
import { v, validatePatch } from "../security/validate.js";
import { sanitizeNoteHtml, htmlToText } from "./htmlUtils.js";
import { DEFAULT_FOLDER_ID } from "./migrations.js";

export const LIMITS = {
  title: 300,
  contentHtml: 5_000_000,
  folderName: 60,
  tagName: 30,
  tagsPerNote: 20,
  boardJson: 8_000_000,
};

export const SETTINGS_DEFAULTS = {
  theme: "system",
  exportDir: "",
  desktopNotifications: true,
  defaultReminderMinutes: 10,
  noteSort: "updated",
  noteSortDirection: "desc",
};

const SETTINGS_VALIDATORS = {
  theme: (x) => v.oneOf(x, ["system", "light", "dark"], "theme"),
  exportDir: (x) => v.str(x, { name: "exportDir", max: 1024 }),
  desktopNotifications: (x) => v.bool(x, "desktopNotifications"),
  defaultReminderMinutes: (x) =>
    v.int(x, { name: "defaultReminderMinutes", min: 1, max: 1440 }),
  noteSort: (x) => v.oneOf(x, ["updated", "created", "title"], "noteSort"),
  noteSortDirection: (x) => v.oneOf(x, ["asc", "desc"], "noteSortDirection"),
};

const SORT_COLUMNS = {
  updated: "n.updated_at",
  created: "n.created_at",
  title: "n.title COLLATE NOCASE",
};

const bool = (n) => n === 1;
const likeEscape = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

function normalizeTagName(raw) {
  const name = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^#+/, "");
  if (!name) return null;
  if (name.length > LIMITS.tagName)
    throw new ValidationError(`Tag "${name.slice(0, 12)}…" is too long`);
  if (/[\u0000-\u001f,]/.test(name))
    throw new ValidationError(
      "Tags cannot contain commas or control characters",
    );
  return name;
}

export class Repo {
  constructor(db, { clock = Date.now } = {}) {
    this.db = db;
    this.clock = clock;
  }

  tx(fn) {
    return this.db.transaction(fn)();
  }

  // ---------- settings ----------
  getSettings() {
    const out = { ...SETTINGS_DEFAULTS };
    for (const row of this.db
      .prepare("SELECT key, value FROM settings")
      .all()) {
      if (!(row.key in SETTINGS_DEFAULTS)) continue;
      try {
        out[row.key] = SETTINGS_VALIDATORS[row.key](JSON.parse(row.value));
      } catch {
        /* ignore corrupt value, keep default */
      }
    }
    return out;
  }

  setSettings(patch) {
    const clean = validatePatch(patch, SETTINGS_VALIDATORS, "settings");
    const stmt = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    this.tx(() => {
      for (const [k, val] of Object.entries(clean))
        stmt.run(k, JSON.stringify(val));
    });
    return this.getSettings();
  }

  // ---------- folders ----------
  listFolders() {
    return this.db
      .prepare(
        `SELECT f.id, f.name, f.is_default, f.created_at,
                (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id) AS note_count
         FROM folders f ORDER BY f.is_default DESC, f.name COLLATE NOCASE`,
      )
      .all()
      .map((r) => ({ ...r, is_default: bool(r.is_default) }));
  }

  getDefaultFolderId() {
    return (
      this.db
        .prepare("SELECT id FROM folders WHERE is_default = 1")
        .pluck()
        .get() ?? DEFAULT_FOLDER_ID
    );
  }

  createFolder(rawName) {
    const name = v.str(rawName, {
      name: "Folder name",
      min: 1,
      max: LIMITS.folderName,
      trim: true,
    });
    const t = this.clock();
    const id = randomUUID();
    try {
      this.db
        .prepare(
          "INSERT INTO folders (id, name, is_default, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
        )
        .run(id, name, t, t);
    } catch (err) {
      if (String(err.code).startsWith("SQLITE_CONSTRAINT")) {
        throw new AppError(
          "EDUPLICATE",
          "A folder with this name already exists.",
        );
      }
      throw err;
    }
    return { id, name, is_default: false, created_at: t, note_count: 0 };
  }

  renameFolder(id, rawName) {
    v.id(id);
    const name = v.str(rawName, {
      name: "Folder name",
      min: 1,
      max: LIMITS.folderName,
      trim: true,
    });
    try {
      const res = this.db
        .prepare("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?")
        .run(name, this.clock(), id);
      if (res.changes === 0)
        throw new AppError("ENOTFOUND", "Folder not found.");
    } catch (err) {
      if (String(err.code).startsWith("SQLITE_CONSTRAINT")) {
        throw new AppError(
          "EDUPLICATE",
          "A folder with this name already exists.",
        );
      }
      throw err;
    }
    return this.listFolders().find((f) => f.id === id);
  }

  // strategy 'move'   -> notes are moved to the default folder (safe default)
  // strategy 'delete' -> notes in the folder are deleted too
  deleteFolder(id, strategy = "move") {
    v.id(id);
    v.oneOf(strategy, ["move", "delete"], "strategy");
    const folder = this.db
      .prepare("SELECT * FROM folders WHERE id = ?")
      .get(id);
    if (!folder) throw new AppError("ENOTFOUND", "Folder not found.");
    if (folder.is_default)
      throw new AppError("EDEFAULT", "The default folder cannot be deleted.");
    return this.tx(() => {
      let movedNotes = 0;
      let deletedNotes = 0;
      let attachmentFiles = [];
      if (strategy === "move") {
        movedNotes = this.db
          .prepare("UPDATE notes SET folder_id = ? WHERE folder_id = ?")
          .run(this.getDefaultFolderId(), id).changes;
      } else {
        const ids = this.db
          .prepare("SELECT id FROM notes WHERE folder_id = ?")
          .pluck()
          .all(id);
        const res = this.deleteNotes(ids);
        deletedNotes = res.deleted;
        attachmentFiles = res.attachmentFiles;
      }
      this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
      this.cleanupTags();
      return { movedNotes, deletedNotes, attachmentFiles };
    });
  }

  // ---------- notes ----------
  rowToNote(r) {
    return {
      id: r.id,
      folder_id: r.folder_id,
      title: r.title,
      content_html: r.content_html,
      content_text: r.content_text,
      pinned: bool(r.pinned),
      favorite: bool(r.favorite),
      urgent: bool(r.urgent),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  createNote({ folderId = null, title = "", contentHtml = "" } = {}) {
    const folder = folderId
      ? v.id(folderId, "folderId")
      : this.getDefaultFolderId();
    if (!this.db.prepare("SELECT 1 FROM folders WHERE id = ?").get(folder)) {
      throw new AppError("ENOTFOUND", "Folder not found.");
    }
    const cleanTitle = v.str(title, { name: "title", max: LIMITS.title });
    const html = sanitizeNoteHtml(
      v.str(contentHtml, { name: "content", max: LIMITS.contentHtml }),
    );
    const t = this.clock();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO notes (id, folder_id, title, content_html, content_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, folder, cleanTitle, html, htmlToText(html), t, t);
    return this.getNote(id);
  }

  getNote(id) {
    v.id(id);
    const row = this.db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
    if (!row) throw new AppError("ENOTFOUND", "Note not found.");
    const note = this.rowToNote(row);
    note.tags = this.getNoteTags(id);
    note.attachments = this.listAttachments(id);
    return note;
  }

  updateNote(id, patch) {
    v.id(id);
    const clean = validatePatch(patch, {
      title: (x) => v.str(x, { name: "title", max: LIMITS.title }),
      content_html: (x) =>
        v.str(x, { name: "content", max: LIMITS.contentHtml }),
      pinned: (x) => v.bool(x, "pinned"),
      favorite: (x) => v.bool(x, "favorite"),
      urgent: (x) => v.bool(x, "urgent"),
      folder_id: (x) => v.id(x, "folder_id"),
    });
    const sets = [];
    const params = { id };
    let contentChanged = false;
    if ("title" in clean) {
      sets.push("title = @title");
      params.title = clean.title;
      contentChanged = true;
    }
    if ("content_html" in clean) {
      const html = sanitizeNoteHtml(clean.content_html);
      sets.push("content_html = @html", "content_text = @text");
      params.html = html;
      params.text = htmlToText(html);
      contentChanged = true;
    }
    for (const flag of ["pinned", "favorite", "urgent"]) {
      if (flag in clean) {
        sets.push(`${flag} = @${flag}`);
        params[flag] = clean[flag] ? 1 : 0;
      }
    }
    if ("folder_id" in clean) {
      if (
        !this.db
          .prepare("SELECT 1 FROM folders WHERE id = ?")
          .get(clean.folder_id)
      ) {
        throw new AppError("ENOTFOUND", "Folder not found.");
      }
      sets.push("folder_id = @folder_id");
      params.folder_id = clean.folder_id;
    }
    if (sets.length === 0) return this.getNote(id);
    if (contentChanged) {
      sets.push("updated_at = @now");
      params.now = this.clock();
    }
    const res = this.db
      .prepare(`UPDATE notes SET ${sets.join(", ")} WHERE id = @id`)
      .run(params);
    if (res.changes === 0) throw new AppError("ENOTFOUND", "Note not found.");
    return this.getNote(id);
  }

  // Returns { deleted, attachmentFiles } so the caller can remove files
  // AFTER the database transaction has succeeded.
  deleteNotes(ids) {
    v.arr(ids, { name: "ids", max: 5000 }).forEach((i) => v.id(i));
    return this.tx(() => {
      const files = [];
      let deleted = 0;
      const getFiles = this.db
        .prepare("SELECT stored_name FROM attachments WHERE note_id = ?")
        .pluck();
      const del = this.db.prepare("DELETE FROM notes WHERE id = ?");
      for (const id of ids) {
        files.push(...getFiles.all(id));
        deleted += del.run(id).changes;
      }
      this.cleanupTags();
      return { deleted, attachmentFiles: files };
    });
  }

  counts() {
    const r = this.db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(pinned),0) AS pinned,
                COALESCE(SUM(favorite),0) AS favorite, COALESCE(SUM(urgent),0) AS urgent FROM notes`,
      )
      .get();
    return {
      all: r.total,
      pinned: r.pinned,
      favorite: r.favorite,
      urgent: r.urgent,
    };
  }

  // filter: { kind: 'all'|'pinned'|'favorite'|'urgent'|'folder'|'tag', folderId?, tag? }
  listNotes({
    filter = { kind: "all" },
    search = "",
    sort = "updated",
    direction = "desc",
  } = {}) {
    v.obj(filter, "filter");
    v.oneOf(
      filter.kind,
      ["all", "pinned", "favorite", "urgent", "folder", "tag"],
      "filter.kind",
    );
    v.oneOf(sort, Object.keys(SORT_COLUMNS), "sort");
    v.oneOf(direction, ["asc", "desc"], "direction");
    v.str(search, { name: "search", max: 200 });

    const where = [];
    const params = {};
    if (filter.kind === "pinned") where.push("n.pinned = 1");
    if (filter.kind === "favorite") where.push("n.favorite = 1");
    if (filter.kind === "urgent") where.push("n.urgent = 1");
    if (filter.kind === "folder") {
      where.push("n.folder_id = @folderId");
      params.folderId = v.id(filter.folderId, "folderId");
    }
    if (filter.kind === "tag") {
      where.push(`EXISTS (SELECT 1 FROM note_tags nt JOIN tags tg ON tg.id = nt.tag_id
                          WHERE nt.note_id = n.id AND tg.name = @tag COLLATE NOCASE)`);
      params.tag = v.str(filter.tag, {
        name: "tag",
        min: 1,
        max: LIMITS.tagName,
      });
    }
    const tokens = search.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    tokens.forEach((tok, i) => {
      params[`s${i}`] = `%${likeEscape(tok)}%`;
      where.push(`(n.title LIKE @s${i} ESCAPE '\\' OR n.content_text LIKE @s${i} ESCAPE '\\'
        OR f.name LIKE @s${i} ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM note_tags nt2 JOIN tags tg2 ON tg2.id = nt2.tag_id
                   WHERE nt2.note_id = n.id AND tg2.name LIKE @s${i} ESCAPE '\\'))`);
    });

    const sql = `
      SELECT n.id, n.title, substr(n.content_text, 1, 160) AS preview, n.folder_id,
             f.name AS folder_name, n.pinned, n.favorite, n.urgent, n.created_at, n.updated_at,
             (SELECT group_concat(t.name, char(31)) FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
              WHERE nt.note_id = n.id) AS tag_names,
             (SELECT COUNT(*) FROM attachments a WHERE a.note_id = n.id) AS attachment_count
      FROM notes n JOIN folders f ON f.id = n.folder_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY n.pinned DESC, ${SORT_COLUMNS[sort]} ${direction === "asc" ? "ASC" : "DESC"}, n.id`;
    return this.db
      .prepare(sql)
      .all(params)
      .map((r) => ({
        id: r.id,
        title: r.title,
        preview: r.preview,
        folder_id: r.folder_id,
        folder_name: r.folder_name,
        pinned: bool(r.pinned),
        favorite: bool(r.favorite),
        urgent: bool(r.urgent),
        created_at: r.created_at,
        updated_at: r.updated_at,
        tags: r.tag_names ? r.tag_names.split("\u001f") : [],
        attachment_count: r.attachment_count,
      }));
  }

  // ---------- tags ----------
  getNoteTags(noteId) {
    return this.db
      .prepare(
        `SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
         WHERE nt.note_id = ? ORDER BY t.name COLLATE NOCASE`,
      )
      .pluck()
      .all(noteId);
  }

  listTags() {
    return this.db
      .prepare(
        `SELECT t.name, COUNT(nt.note_id) AS note_count FROM tags t
         JOIN note_tags nt ON nt.tag_id = t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
      )
      .all();
  }

  setNoteTags(noteId, names) {
    v.id(noteId, "noteId");
    v.arr(names, { name: "tags", max: LIMITS.tagsPerNote });
    const clean = [];
    const seen = new Set();
    for (const raw of names) {
      const n = normalizeTagName(raw);
      if (n && !seen.has(n.toLowerCase())) {
        seen.add(n.toLowerCase());
        clean.push(n);
      }
    }
    if (!this.db.prepare("SELECT 1 FROM notes WHERE id = ?").get(noteId)) {
      throw new AppError("ENOTFOUND", "Note not found.");
    }
    this.tx(() => {
      this.db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
      for (const name of clean) {
        let tagId = this.db
          .prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE")
          .pluck()
          .get(name);
        if (!tagId) {
          tagId = randomUUID();
          this.db
            .prepare("INSERT INTO tags (id, name) VALUES (?, ?)")
            .run(tagId, name);
        }
        this.db
          .prepare(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
          )
          .run(noteId, tagId);
      }
      this.cleanupTags();
    });
    return this.getNoteTags(noteId);
  }

  cleanupTags() {
    this.db
      .prepare(
        "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)",
      )
      .run();
  }

  // ---------- attachments ----------
  listAttachments(noteId) {
    return this.db
      .prepare(
        "SELECT id, note_id, original_name, mime, size, created_at, stored_name FROM attachments WHERE note_id = ? ORDER BY created_at, id",
      )
      .all(noteId)
      .map(({ stored_name, ...rest }) => ({
        ...rest,
        is_image: rest.mime.startsWith("image/"),
      }));
  }

  getAttachmentRow(id) {
    v.id(id);
    const row = this.db
      .prepare("SELECT * FROM attachments WHERE id = ?")
      .get(id);
    if (!row) throw new AppError("ENOTFOUND", "Attachment not found.");
    return row;
  }

  addAttachment({
    noteId,
    originalName,
    storedName,
    mime,
    size,
    id = randomUUID(),
    createdAt = this.clock(),
  }) {
    this.db
      .prepare(
        `INSERT INTO attachments (id, note_id, original_name, stored_name, mime, size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, noteId, originalName, storedName, mime, size, createdAt);
    return id;
  }

  deleteAttachment(id) {
    const row = this.getAttachmentRow(id);
    this.db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
    return row.stored_name;
  }

  // ---------- boards ----------
  listBoards() {
    return this.db
      .prepare(
        "SELECT id, name, updated_at FROM boards ORDER BY updated_at DESC",
      )
      .all();
  }

  createBoard(rawName) {
    const name = v.str(rawName, {
      name: "Board name",
      min: 1,
      max: 80,
      trim: true,
    });
    const t = this.clock();
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, name, t, t);
    return this.getBoard(id);
  }

  getBoard(id) {
    v.id(id);
    const row = this.db.prepare("SELECT * FROM boards WHERE id = ?").get(id);
    if (!row) throw new AppError("ENOTFOUND", "Board not found.");
    return row;
  }

  saveBoard(id, { name, data_json }) {
    v.id(id);
    const sets = [];
    const params = { id, now: this.clock() };
    if (name !== undefined) {
      sets.push("name = @name");
      params.name = v.str(name, {
        name: "Board name",
        min: 1,
        max: 80,
        trim: true,
      });
    }
    if (data_json !== undefined) {
      v.str(data_json, { name: "board data", max: LIMITS.boardJson });
      try {
        JSON.parse(data_json);
      } catch {
        throw new ValidationError("Board data is not valid JSON");
      }
      sets.push("data_json = @data");
      params.data = data_json;
    }
    if (!sets.length) return this.getBoard(id);
    const res = this.db
      .prepare(
        `UPDATE boards SET ${sets.join(", ")}, updated_at = @now WHERE id = @id`,
      )
      .run(params);
    if (res.changes === 0) throw new AppError("ENOTFOUND", "Board not found.");
    return this.getBoard(id);
  }

  deleteBoard(id) {
    v.id(id);
    this.db.prepare("DELETE FROM boards WHERE id = ?").run(id);
  }

  // ---------- reminders & timers (used by the scheduler) ----------
  createReminder({ title, dueAt, noteId = null }) {
    const t = this.clock();
    v.str(title, { name: "title", min: 1, max: 200, trim: true });
    v.int(dueAt, { name: "dueAt", min: 0 });
    if (dueAt < t - 1000)
      throw new ValidationError("Reminder time must be in the future.");
    if (
      noteId &&
      !this.db
        .prepare("SELECT 1 FROM notes WHERE id = ?")
        .get(v.id(noteId, "noteId"))
    ) {
      throw new AppError("ENOTFOUND", "Note not found.");
    }
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO reminders (id, note_id, title, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, noteId, title.trim(), dueAt, "pending", t);
    return this.getReminder(id);
  }

  getReminder(id) {
    return this.db.prepare("SELECT * FROM reminders WHERE id = ?").get(id);
  }

  listReminders() {
    return this.db
      .prepare(
        `SELECT r.*, n.title AS note_title FROM reminders r LEFT JOIN notes n ON n.id = r.note_id
         WHERE r.status IN ('pending','fired','missed')
         ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.due_at`,
      )
      .all();
  }

  setReminderStatus(id, status) {
    v.id(id);
    v.oneOf(status, ["dismissed", "cancelled"], "status");
    this.db
      .prepare("UPDATE reminders SET status = ? WHERE id = ?")
      .run(status, id);
  }

  dueReminders(now) {
    return this.db
      .prepare(
        "SELECT * FROM reminders WHERE status = 'pending' AND due_at <= ? ORDER BY due_at",
      )
      .all(now);
  }

  markReminders(ids, status, firedAt) {
    const stmt = this.db.prepare(
      "UPDATE reminders SET status = ?, fired_at = ? WHERE id = ?",
    );
    this.tx(() => ids.forEach((id) => stmt.run(status, firedAt, id)));
  }

  createTimer({ label, durationMs, noteId = null }) {
    const t = this.clock();
    v.str(label, { name: "label", min: 1, max: 100, trim: true });
    v.int(durationMs, { name: "duration", min: 1000, max: 24 * 3600 * 1000 });
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO timers (id, note_id, label, duration_ms, remaining_ms, state, ends_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
      )
      .run(
        id,
        noteId,
        label.trim(),
        durationMs,
        durationMs,
        t + durationMs,
        t,
        t,
      );
    return this.getTimer(id);
  }

  getTimer(id) {
    return this.db.prepare("SELECT * FROM timers WHERE id = ?").get(id);
  }

  listTimers() {
    return this.db
      .prepare(
        "SELECT * FROM timers WHERE state IN ('running','paused','done') ORDER BY created_at DESC",
      )
      .all();
  }

  pauseTimer(id) {
    v.id(id);
    const t = this.getTimer(id);
    if (!t || t.state !== "running")
      throw new AppError("ESTATE", "Only a running timer can be paused.");
    const remaining = Math.max(0, t.ends_at - this.clock());
    this.db
      .prepare(
        "UPDATE timers SET state = 'paused', remaining_ms = ?, ends_at = NULL, updated_at = ? WHERE id = ?",
      )
      .run(remaining, this.clock(), id);
    return this.getTimer(id);
  }

  resumeTimer(id) {
    v.id(id);
    const t = this.getTimer(id);
    if (!t || t.state !== "paused")
      throw new AppError("ESTATE", "Only a paused timer can be resumed.");
    const now = this.clock();
    this.db
      .prepare(
        "UPDATE timers SET state = 'running', ends_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(now + t.remaining_ms, now, id);
    return this.getTimer(id);
  }

  cancelTimer(id) {
    v.id(id);
    this.db
      .prepare(
        "UPDATE timers SET state = 'cancelled', ends_at = NULL, updated_at = ? WHERE id = ?",
      )
      .run(this.clock(), id);
  }

  dismissTimer(id) {
    v.id(id);
    this.db
      .prepare(
        "UPDATE timers SET state = 'cancelled' WHERE id = ? AND state = 'done'",
      )
      .run(id);
  }

  dueTimers(now) {
    return this.db
      .prepare("SELECT * FROM timers WHERE state = 'running' AND ends_at <= ?")
      .all(now);
  }

  markTimersDone(ids) {
    const stmt = this.db.prepare(
      "UPDATE timers SET state = 'done', remaining_ms = 0, ends_at = NULL, updated_at = ? WHERE id = ?",
    );
    this.tx(() => ids.forEach((id) => stmt.run(this.clock(), id)));
  }
}
