import fs from 'node:fs';
import path from 'node:path';
import { friendlyError } from '../security/errors.js';
import { htmlToMarkdown, noteToHtmlDocument } from './htmlUtils.js';
import { safeJoin } from '../security/paths.js';

export const BACKUP_FORMAT = 'desktop-notes-backup';
export const BACKUP_VERSION = 1;

// Write to a temporary file first and rename it. If the disk fills up or the
// app is killed half-way, the real target is never left half-written.
export async function writeFileAtomic(target, data) {
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(tmp, data);
    await fs.promises.rename(tmp, target);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw friendlyError(err, 'Could not write the file.');
  }
}

export function noteToTxt(note) {
  return `${note.title || 'Untitled'}\n\n${note.content_text}\n`;
}

export function noteToMd(note) {
  return `# ${note.title || 'Untitled'}\n\n${htmlToMarkdown(note.content_html)}\n`;
}

export function noteToJson(note) {
  return JSON.stringify(
    {
      format: 'desktop-notes-note',
      version: 1,
      note: {
        id: note.id,
        title: note.title,
        content_html: note.content_html,
        tags: note.tags ?? [],
        pinned: note.pinned,
        favorite: note.favorite,
        urgent: note.urgent,
        created_at: note.created_at,
        updated_at: note.updated_at,
      },
    },
    null,
    2,
  );
}

export const NOTE_FORMATS = {
  txt: { ext: 'txt', render: noteToTxt },
  md: { ext: 'md', render: noteToMd },
  json: { ext: 'json', render: noteToJson },
};

export { noteToHtmlDocument };

// Full backup: every folder, note, tag, board and attachment (as base64).
export async function buildBackup(repo, attachmentsDir, now = Date.now()) {
  const db = repo.db;
  const warnings = [];
  const folders = db.prepare('SELECT id, name, is_default, created_at, updated_at FROM folders').all();
  const noteRows = db.prepare('SELECT * FROM notes ORDER BY created_at').all();
  const notes = [];
  for (const n of noteRows) {
    const attachments = [];
    const rows = db.prepare('SELECT * FROM attachments WHERE note_id = ?').all(n.id);
    for (const a of rows) {
      let data_base64 = null;
      try {
        const buf = await fs.promises.readFile(safeJoin(attachmentsDir, a.stored_name));
        data_base64 = buf.toString('base64');
      } catch {
        warnings.push(`Attachment "${a.original_name}" is missing on disk and was exported without data.`);
      }
      attachments.push({
        id: a.id,
        original_name: a.original_name,
        mime: a.mime,
        size: a.size,
        created_at: a.created_at,
        data_base64,
      });
    }
    notes.push({
      id: n.id,
      folder_id: n.folder_id,
      title: n.title,
      content_html: n.content_html,
      pinned: n.pinned === 1,
      favorite: n.favorite === 1,
      urgent: n.urgent === 1,
      created_at: n.created_at,
      updated_at: n.updated_at,
      tags: repo.getNoteTags(n.id),
      attachments,
    });
  }
  const boards = db.prepare('SELECT id, name, data_json, created_at, updated_at FROM boards').all();
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    folders: folders.map((f) => ({ ...f, is_default: f.is_default === 1 })),
    notes,
    boards,
  };
  return { backup, warnings };
}

export function backupFileName(now = new Date()) {
  const d = now.toISOString().slice(0, 10);
  return `desktop-notes-backup-${d}.json`;
}

export function dirOrNull(p) {
  try {
    return p && fs.statSync(p).isDirectory() ? path.resolve(p) : null;
  } catch {
    return null;
  }
}
