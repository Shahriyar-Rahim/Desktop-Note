import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AppError } from '../security/errors.js';
import { safeJoin, extOf } from '../security/paths.js';
import { sanitizeNoteHtml, htmlToText } from './htmlUtils.js';
import { BACKUP_FORMAT, BACKUP_VERSION } from './exporter.js';
import { ALLOWED_TYPES, MAX_ATTACHMENT_BYTES, sniffOk } from './attachments.js';

export const MAX_IMPORT_BYTES = 300 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

const isNum = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const clampTime = (x, fallback) => (isNum(x) ? Math.floor(x) : fallback);

// Parse and validate backup text. Never throws for bad content: it returns
// { ok:false, error } or { ok:true, backup, report }. Bad entries are skipped
// and listed in report.skipped so nothing disappears silently.
export function parseBackup(text, repo, now = Date.now()) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON. It may be damaged or not a backup.' };
  }
  if (!raw || typeof raw !== 'object' || raw.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This file is not a Desktop Notes backup.' };
  }
  if (!Number.isInteger(raw.version) || raw.version < 1) {
    return { ok: false, error: 'The backup has no valid version number.' };
  }
  if (raw.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was created by a newer version of the app. Please update first.' };
  }

  const skipped = [];
  const warnings = [];
  const db = repo.db;
  const existingFolderIds = new Set(db.prepare('SELECT id FROM folders').pluck().all());
  const existingNoteIds = new Set(db.prepare('SELECT id FROM notes').pluck().all());
  const existingBoardIds = new Set(db.prepare('SELECT id FROM boards').pluck().all());

  const folders = [];
  const seenFolders = new Set();
  (Array.isArray(raw.folders) ? raw.folders : []).forEach((f, i) => {
    if (!f || typeof f.id !== 'string' || !ID_RE.test(f.id) || typeof f.name !== 'string' || !f.name.trim()) {
      skipped.push({ kind: 'folder', index: i, reason: 'missing id or name' });
      return;
    }
    if (seenFolders.has(f.id)) {
      skipped.push({ kind: 'folder', index: i, reason: `duplicate id inside the file (${f.id})` });
      return;
    }
    seenFolders.add(f.id);
    folders.push({
      id: f.id,
      name: f.name.trim().slice(0, 60),
      is_default: f.is_default === true,
      created_at: clampTime(f.created_at, now),
      updated_at: clampTime(f.updated_at, now),
    });
  });

  const notes = [];
  const seenNotes = new Set();
  let attachmentCount = 0;
  (Array.isArray(raw.notes) ? raw.notes : []).forEach((n, i) => {
    if (!n || typeof n.id !== 'string' || !ID_RE.test(n.id)) {
      skipped.push({ kind: 'note', index: i, reason: 'missing or invalid id' });
      return;
    }
    if (seenNotes.has(n.id)) {
      skipped.push({ kind: 'note', index: i, reason: `duplicate id inside the file (${n.id})` });
      return;
    }
    if (typeof n.title !== 'string' || typeof n.content_html !== 'string') {
      skipped.push({ kind: 'note', index: i, reason: 'title or content is not text' });
      return;
    }
    seenNotes.add(n.id);
    const html = sanitizeNoteHtml(n.content_html);
    const tags = Array.isArray(n.tags)
      ? n.tags.filter((t) => typeof t === 'string' && t.trim() && t.length <= 30).slice(0, 20)
      : [];
    const attachments = [];
    (Array.isArray(n.attachments) ? n.attachments : []).forEach((a) => {
      const ext = extOf(a?.original_name ?? '');
      if (!a || typeof a.original_name !== 'string' || !ALLOWED_TYPES[ext]) {
        warnings.push(`Attachment "${a?.original_name ?? '?'}" in note "${n.title.slice(0, 30)}" has an unsupported type and was skipped.`);
        return;
      }
      if (typeof a.data_base64 !== 'string' || !B64_RE.test(a.data_base64)) {
        warnings.push(`Attachment "${a.original_name}" has no valid data and was skipped.`);
        return;
      }
      const approx = Math.floor((a.data_base64.length * 3) / 4);
      if (approx > MAX_ATTACHMENT_BYTES) {
        warnings.push(`Attachment "${a.original_name}" is too large and was skipped.`);
        return;
      }
      const buf = Buffer.from(a.data_base64, 'base64');
      if (!sniffOk(ext, buf.subarray(0, 4096))) {
        warnings.push(`Attachment "${a.original_name}" does not match its file type and was skipped.`);
        return;
      }
      attachments.push({
        id: typeof a.id === 'string' && ID_RE.test(a.id) ? a.id : randomUUID(),
        original_name: a.original_name.slice(0, 200),
        ext,
        mime: ALLOWED_TYPES[ext],
        buffer: buf,
        created_at: clampTime(a.created_at, now),
      });
      attachmentCount += 1;
    });
    notes.push({
      id: n.id,
      folder_id: typeof n.folder_id === 'string' ? n.folder_id : null,
      title: n.title.slice(0, 300),
      content_html: html,
      content_text: htmlToText(html),
      pinned: n.pinned === true,
      favorite: n.favorite === true,
      urgent: n.urgent === true,
      created_at: clampTime(n.created_at, now),
      updated_at: clampTime(n.updated_at, now),
      tags,
      attachments,
    });
  });

  const boards = [];
  const seenBoards = new Set();
  (Array.isArray(raw.boards) ? raw.boards : []).forEach((b, i) => {
    let ok = b && typeof b.id === 'string' && ID_RE.test(b.id) && typeof b.name === 'string' && typeof b.data_json === 'string';
    if (ok) {
      try { JSON.parse(b.data_json); } catch { ok = false; }
    }
    if (!ok) { skipped.push({ kind: 'board', index: i, reason: 'invalid board data' }); return; }
    if (seenBoards.has(b.id)) { skipped.push({ kind: 'board', index: i, reason: 'duplicate id inside the file' }); return; }
    seenBoards.add(b.id);
    boards.push({
      id: b.id,
      name: b.name.trim().slice(0, 80) || 'Board',
      data_json: b.data_json,
      created_at: clampTime(b.created_at, now),
      updated_at: clampTime(b.updated_at, now),
    });
  });

  const folderIdsKnown = new Set([...folders.map((f) => f.id), ...existingFolderIds]);
  notes.forEach((n) => {
    if (!n.folder_id || !folderIdsKnown.has(n.folder_id)) {
      if (n.folder_id) warnings.push(`Note "${n.title.slice(0, 30) || 'Untitled'}" refers to a missing folder and goes to the default folder.`);
      n.folder_id = null;
    }
  });

  const report = {
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
    folders: { total: folders.length, existing: folders.filter((f) => existingFolderIds.has(f.id)).length },
    notes: {
      total: notes.length,
      duplicates: notes.filter((n) => existingNoteIds.has(n.id)).length,
      new: notes.filter((n) => !existingNoteIds.has(n.id)).length,
    },
    boards: { total: boards.length, duplicates: boards.filter((b) => existingBoardIds.has(b.id)).length },
    attachments: attachmentCount,
    skipped,
    warnings,
  };
  return { ok: true, backup: { folders, notes, boards }, report };
}

// Apply a parsed backup. mode: 'skip' keeps existing notes with the same id,
// 'overwrite' replaces them. Attachment files are written first and removed
// again if the database transaction fails.
export async function applyBackup({ repo, attachmentsDir, backup, mode }) {
  if (mode !== 'skip' && mode !== 'overwrite') throw new AppError('EVALIDATION', 'Unknown import mode.');
  const db = repo.db;
  const existingNoteIds = new Set(db.prepare('SELECT id FROM notes').pluck().all());
  const toImport = backup.notes.filter((n) => mode === 'overwrite' || !existingNoteIds.has(n.id));
  const skippedNotes = backup.notes.length - toImport.length;

  await fs.promises.mkdir(attachmentsDir, { recursive: true });
  const written = [];
  const planned = []; // { noteId, att, storedName }
  try {
    for (const n of toImport) {
      for (const a of n.attachments) {
        const storedName = `${randomUUID()}.${a.ext}`;
        await fs.promises.writeFile(safeJoin(attachmentsDir, storedName), a.buffer, { flag: 'wx' });
        written.push(storedName);
        planned.push({ noteId: n.id, att: a, storedName });
      }
    }

    const result = repo.tx(() => {
      const folderMap = new Map();
      const defaultId = repo.getDefaultFolderId();
      let newFolders = 0;
      for (const f of backup.folders) {
        if (f.is_default) { folderMap.set(f.id, defaultId); continue; }
        const byId = db.prepare('SELECT id FROM folders WHERE id = ?').pluck().get(f.id);
        if (byId) { folderMap.set(f.id, byId); continue; }
        const byName = db.prepare('SELECT id FROM folders WHERE name = ? COLLATE NOCASE').pluck().get(f.name);
        if (byName) { folderMap.set(f.id, byName); continue; }
        db.prepare('INSERT INTO folders (id, name, is_default, created_at, updated_at) VALUES (?, ?, 0, ?, ?)')
          .run(f.id, f.name, f.created_at, f.updated_at);
        folderMap.set(f.id, f.id);
        newFolders += 1;
      }
      const oldFiles = [];
      let importedNotes = 0;
      for (const n of toImport) {
        if (existingNoteIds.has(n.id)) {
          oldFiles.push(...db.prepare('SELECT stored_name FROM attachments WHERE note_id = ?').pluck().all(n.id));
          db.prepare('DELETE FROM notes WHERE id = ?').run(n.id);
        }
        let folderId = n.folder_id ? folderMap.get(n.folder_id) ?? n.folder_id : defaultId;
        if (!db.prepare('SELECT 1 FROM folders WHERE id = ?').get(folderId)) folderId = defaultId;
        db.prepare(
          `INSERT INTO notes (id, folder_id, title, content_html, content_text, pinned, favorite, urgent, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(n.id, folderId, n.title, n.content_html, n.content_text, +n.pinned, +n.favorite, +n.urgent, n.created_at, n.updated_at);
        if (n.tags.length) repo.setNoteTags(n.id, n.tags);
        importedNotes += 1;
      }
      for (const p of planned) {
        const idTaken = db.prepare('SELECT 1 FROM attachments WHERE id = ?').get(p.att.id);
        repo.addAttachment({
          id: idTaken ? randomUUID() : p.att.id,
          noteId: p.noteId,
          originalName: p.att.original_name,
          storedName: p.storedName,
          mime: p.att.mime,
          size: p.att.buffer.length,
          createdAt: p.att.created_at,
        });
      }
      let importedBoards = 0;
      for (const b of backup.boards) {
        const exists = db.prepare('SELECT 1 FROM boards WHERE id = ?').get(b.id);
        if (exists && mode === 'skip') continue;
        db.prepare(
          `INSERT INTO boards (id, name, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, data_json = excluded.data_json, updated_at = excluded.updated_at`,
        ).run(b.id, b.name, b.data_json, b.created_at, b.updated_at);
        importedBoards += 1;
      }
      repo.cleanupTags();
      return { importedNotes, newFolders, importedBoards, oldFiles };
    });
    return { ...result, skippedNotes, attachments: planned.length };
  } catch (err) {
    for (const n of written) await fs.promises.rm(safeJoin(attachmentsDir, n), { force: true }).catch(() => {});
    throw err;
  }
}
