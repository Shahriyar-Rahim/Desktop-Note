import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { memoryRepo, tmpDir } from './helpers.js';
import {
  buildBackup, noteToTxt, noteToMd, noteToJson, writeFileAtomic, BACKUP_FORMAT,
} from '../electron/services/exporter.js';
import { parseBackup, applyBackup } from '../electron/services/importer.js';
import { addFiles } from '../electron/services/attachments.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
let repo;
let attachDir;
let scratch;

beforeEach(() => {
  repo = memoryRepo();
  scratch = tmpDir();
  attachDir = path.join(scratch, 'attachments');
});

async function seed() {
  const f = repo.createFolder('Work');
  const n = repo.createNote({ title: 'Plan', folderId: f.id, contentHtml: '<h2>Goals</h2><p>Ship it</p>' });
  repo.setNoteTags(n.id, ['alpha']);
  repo.updateNote(n.id, { pinned: true });
  const pic = path.join(scratch, 'pic.png');
  fs.writeFileSync(pic, PNG);
  await addFiles({ repo, attachmentsDir: attachDir, noteId: n.id, paths: [pic] });
  repo.createBoard('Sketch');
  return n;
}

describe('single-note export formats', () => {
  it('produces TXT, Markdown and JSON', () => {
    const n = repo.createNote({ title: 'Doc', contentHtml: '<h1>Head</h1><p>Body</p>' });
    const note = { ...repo.getNote(n.id) };
    expect(noteToTxt(note)).toBe('Doc\n\nHead\nBody\n');
    expect(noteToMd(note)).toBe('# Doc\n\n# Head\n\nBody\n');
    expect(JSON.parse(noteToJson(note)).note.title).toBe('Doc');
  });
});

describe('backup round trip', () => {
  it('exports everything and restores it into an empty database', async () => {
    const n = await seed();
    const { backup } = await buildBackup(repo, attachDir);
    expect(backup.format).toBe(BACKUP_FORMAT);
    const text = JSON.stringify(backup);

    const repo2 = memoryRepo();
    const dir2 = path.join(tmpDir(), 'attachments');
    const parsed = parseBackup(text, repo2);
    expect(parsed.ok).toBe(true);
    expect(parsed.report.notes).toMatchObject({ total: 1, new: 1, duplicates: 0 });
    const res = await applyBackup({ repo: repo2, attachmentsDir: dir2, backup: parsed.backup, mode: 'skip' });
    expect(res.importedNotes).toBe(1);
    const restored = repo2.getNote(n.id);
    expect(restored.title).toBe('Plan');
    expect(restored.pinned).toBe(true);
    expect(restored.tags).toEqual(['alpha']);
    expect(restored.attachments).toHaveLength(1);
    expect(fs.readdirSync(dir2)).toHaveLength(1);
    expect(repo2.listFolders().map((f) => f.name)).toContain('Work');
    expect(repo2.db.prepare('SELECT COUNT(*) FROM boards').pluck().get()).toBe(1);
  });

  it('detects duplicates and honours skip / overwrite modes', async () => {
    const n = await seed();
    const { backup } = await buildBackup(repo, attachDir);
    repo.updateNote(n.id, { title: 'Changed locally' });
    const text = JSON.stringify(backup);

    const parsed = parseBackup(text, repo);
    expect(parsed.report.notes.duplicates).toBe(1);

    const skipped = await applyBackup({ repo, attachmentsDir: attachDir, backup: parsed.backup, mode: 'skip' });
    expect(skipped.skippedNotes).toBe(1);
    expect(repo.getNote(n.id).title).toBe('Changed locally');

    const parsed2 = parseBackup(text, repo);
    await applyBackup({ repo, attachmentsDir: attachDir, backup: parsed2.backup, mode: 'overwrite' });
    expect(repo.getNote(n.id).title).toBe('Plan');
    expect(repo.getNote(n.id).attachments).toHaveLength(1);
  });
});

describe('malformed imports', () => {
  it('rejects text that is not JSON', () => {
    const r = parseBackup('this is { not json', repo);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not valid JSON/);
  });
  it('rejects JSON that is not a backup, or is from a newer version', () => {
    expect(parseBackup('{"hello":1}', repo).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99 }), repo).error).toMatch(/newer version/);
  });
  it('skips bad entries, reports them, and sanitises content', () => {
    const text = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      folders: [{ id: 'f1', name: 'Good' }, { id: 'f1', name: 'Duplicate id' }, { name: 'no id' }],
      notes: [
        { id: 'n1', folder_id: 'f1', title: 'ok', content_html: '<p>hi</p><script>bad()</script>' },
        { id: 'n1', title: 'dup', content_html: '' },
        { id: '../evil', title: 'x', content_html: '' },
        { id: 'n2', title: 5, content_html: '' },
        { id: 'n3', folder_id: 'ghost', title: 'orphan', content_html: '' },
      ],
    });
    const r = parseBackup(text, repo);
    expect(r.ok).toBe(true);
    expect(r.report.notes.total).toBe(2);
    expect(r.report.skipped.map((s) => s.kind)).toEqual(['folder', 'folder', 'note', 'note', 'note']);
    expect(r.report.skipped.some((s) => /duplicate id/.test(s.reason))).toBe(true);
    expect(r.backup.notes[0].content_html).not.toContain('script');
    expect(r.report.warnings.join(' ')).toMatch(/missing folder/);
  });
  it('skips attachments whose bytes do not match their type', () => {
    const text = JSON.stringify({
      format: BACKUP_FORMAT, version: 1,
      notes: [{ id: 'n1', title: 't', content_html: '', attachments: [
        { original_name: 'fake.png', data_base64: Buffer.from('not a png at all').toString('base64') },
        { original_name: 'run.exe', data_base64: 'AAAA' },
      ] }],
    });
    const r = parseBackup(text, repo);
    expect(r.backup.notes[0].attachments).toHaveLength(0);
    expect(r.report.warnings).toHaveLength(2);
  });
  it('rolls back completely if the database part fails and removes written files', async () => {
    const f = { id: 'f2', name: 'F', is_default: false, created_at: 1, updated_at: 1 };
    const note = (id) => ({ id, folder_id: 'f2', title: id, content_html: '', content_text: '', pinned: false, favorite: false, urgent: false, created_at: 1, updated_at: 1, tags: [], attachments: id === 'a' ? [{ id: 'att1', original_name: 'p.png', ext: 'png', mime: 'image/png', buffer: PNG, created_at: 1 }] : [] });
    // Two notes with the same id make the second INSERT fail inside the transaction.
    const backup = { folders: [f], notes: [note('a'), note('a')], boards: [] };
    await expect(applyBackup({ repo, attachmentsDir: attachDir, backup, mode: 'skip' })).rejects.toThrow();
    expect(repo.listNotes()).toHaveLength(0);
    expect(repo.listFolders().map((x) => x.name)).not.toContain('F');
    expect(fs.readdirSync(attachDir)).toHaveLength(0);
  });
});

describe('writing files safely', () => {
  it('writes atomically and leaves no temp file', async () => {
    const target = path.join(scratch, 'out.txt');
    await writeFileAtomic(target, 'hello');
    expect(fs.readFileSync(target, 'utf8')).toBe('hello');
    expect(fs.readdirSync(scratch).filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
  });
  it('reports a friendly error when the folder does not exist', async () => {
    await expect(writeFileAtomic(path.join(scratch, 'nope', 'x.txt'), 'x')).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('does not touch an existing file if the write fails', async () => {
    const target = path.join(scratch, 'keep.txt');
    fs.writeFileSync(target, 'original');
    // writing a directory path as tmp target is impossible: use a path whose parent is a file
    await expect(writeFileAtomic(path.join(target, 'child.txt'), 'x')).rejects.toBeTruthy();
    expect(fs.readFileSync(target, 'utf8')).toBe('original');
  });
});
