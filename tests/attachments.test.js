import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { memoryRepo, tmpDir } from './helpers.js';
import { validateFile, addFiles, resolveAttachmentPath, withMissingFlags, MAX_ATTACHMENT_BYTES } from '../electron/services/attachments.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
let repo; let dir; let attachDir; let note;
beforeEach(() => {
  repo = memoryRepo();
  dir = tmpDir();
  attachDir = path.join(dir, 'att');
  note = repo.createNote({ title: 'with files' });
});
const write = (name, data) => { const p = path.join(dir, name); fs.writeFileSync(p, data); return p; };

describe('attachment validation', () => {
  it('accepts a real PNG and a text file', async () => {
    expect(await validateFile(write('a.png', PNG))).toMatchObject({ ext: 'png', mime: 'image/png' });
    expect(await validateFile(write('a.txt', 'hello'))).toMatchObject({ ext: 'txt' });
  });
  it('rejects disallowed extensions, fake images, empty files and directories', async () => {
    await expect(validateFile(write('run.exe', 'MZ....'))).rejects.toMatchObject({ code: 'ETYPE' });
    await expect(validateFile(write('fake.png', 'plain text pretending'))).rejects.toMatchObject({ code: 'ETYPE' });
    await expect(validateFile(write('empty.txt', ''))).rejects.toMatchObject({ code: 'EINVALID' });
    await expect(validateFile(dir)).rejects.toMatchObject({ code: 'EINVALID' });
    await expect(validateFile(path.join(dir, 'missing.png'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects files over the size limit', async () => {
    const big = path.join(dir, 'big.txt');
    const fd = fs.openSync(big, 'w');
    fs.ftruncateSync(fd, MAX_ATTACHMENT_BYTES + 1);
    fs.closeSync(fd);
    await expect(validateFile(big)).rejects.toMatchObject({ code: 'ETOOBIG' });
  });
});

describe('storing attachments', () => {
  it('copies files under random names and reports failures per file', async () => {
    const good = write('photo.png', PNG);
    const bad = write('x.exe', 'nope');
    const res = await addFiles({ repo, attachmentsDir: attachDir, noteId: note.id, paths: [good, bad] });
    expect(res.added).toHaveLength(1);
    expect(res.failed).toEqual([{ name: 'x.exe', reason: expect.stringMatching(/not supported/) }]);
    const stored = fs.readdirSync(attachDir);
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toContain('photo'); // original name is never used on disk
  });

  it('flags attachments whose file went missing', async () => {
    await addFiles({ repo, attachmentsDir: attachDir, noteId: note.id, paths: [write('p.png', PNG)] });
    expect(withMissingFlags(repo, attachDir, note.id)[0].missing).toBe(false);
    fs.rmSync(path.join(attachDir, fs.readdirSync(attachDir)[0]));
    expect(withMissingFlags(repo, attachDir, note.id)[0].missing).toBe(true);
    const id = repo.listAttachments(note.id)[0].id;
    expect(() => resolveAttachmentPath(repo, attachDir, id)).toThrow(/missing/);
  });

  it('removes attachment rows when the note is deleted', async () => {
    await addFiles({ repo, attachmentsDir: attachDir, noteId: note.id, paths: [write('p.png', PNG)] });
    const res = repo.deleteNotes([note.id]);
    expect(res.attachmentFiles).toHaveLength(1);
    expect(repo.db.prepare('SELECT COUNT(*) FROM attachments').pluck().get()).toBe(0);
  });
});
