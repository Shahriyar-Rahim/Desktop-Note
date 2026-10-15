import { describe, it, expect, beforeEach } from 'vitest';
import { memoryRepo } from './helpers.js';

let repo;
let t = 1_000;
beforeEach(() => { t = 1_000; repo = memoryRepo(() => (t += 10)); });

describe('notes CRUD', () => {
  it('creates, reads, updates and deletes a note', () => {
    const n = repo.createNote({ title: 'First' });
    expect(n.title).toBe('First');
    expect(repo.getNote(n.id).folder_id).toBe('default');
    const before = repo.getNote(n.id).updated_at;
    const u = repo.updateNote(n.id, { content_html: '<p>Hello <strong>world</strong></p>' });
    expect(u.content_text).toBe('Hello world');
    expect(u.updated_at).toBeGreaterThan(before);
    expect(repo.deleteNotes([n.id]).deleted).toBe(1);
    expect(() => repo.getNote(n.id)).toThrow(/not found/i);
  });

  it('keeps persistent unique ids', () => {
    const a = repo.createNote({});
    const b = repo.createNote({});
    expect(a.id).not.toBe(b.id);
  });

  it('sanitises dangerous HTML before saving', () => {
    const n = repo.createNote({ contentHtml: '<p onclick="x()">hi</p><script>alert(1)</script><a href="javascript:evil()">l</a>' });
    expect(n.content_html).not.toMatch(/script|onclick|javascript:/);
  });

  it('rejects unknown fields and invalid values', () => {
    const n = repo.createNote({});
    expect(() => repo.updateNote(n.id, { id: 'x' })).toThrow(/Unknown field/);
    expect(() => repo.updateNote(n.id, { pinned: 'yes' })).toThrow();
    expect(() => repo.updateNote('../etc', { title: 'x' })).toThrow(/valid id/);
  });

  it('handles empty notes', () => {
    const n = repo.createNote({});
    expect(n.title).toBe('');
    expect(n.content_text).toBe('');
    expect(repo.listNotes()).toHaveLength(1);
  });
});

describe('pin / favorite / urgent and sorting', () => {
  it('lists pinned notes first and filters by flag', () => {
    const a = repo.createNote({ title: 'A' });
    const b = repo.createNote({ title: 'B' });
    const c = repo.createNote({ title: 'C' });
    repo.updateNote(a.id, { pinned: true, urgent: true });
    repo.updateNote(c.id, { favorite: true });
    const order = repo.listNotes({ sort: 'updated', direction: 'desc' }).map((n) => n.title);
    expect(order[0]).toBe('A'); // pinned first
    expect(repo.listNotes({ filter: { kind: 'pinned' } }).map((n) => n.title)).toEqual(['A']);
    expect(repo.listNotes({ filter: { kind: 'favorite' } }).map((n) => n.title)).toEqual(['C']);
    expect(repo.listNotes({ filter: { kind: 'urgent' } }).map((n) => n.title)).toEqual(['A']);
    expect(repo.counts()).toEqual({ all: 3, pinned: 1, favorite: 1, urgent: 1 });
    expect(b.id).toBeTruthy();
  });

  it('sorts by title ascending', () => {
    ['b', 'C', 'a'].forEach((title) => repo.createNote({ title }));
    expect(repo.listNotes({ sort: 'title', direction: 'asc' }).map((n) => n.title)).toEqual(['a', 'b', 'C']);
  });
});

describe('search and tags', () => {
  it('searches titles, content, folder names and tags', () => {
    const f = repo.createFolder('Recipes');
    const n1 = repo.createNote({ title: 'Pasta', folderId: f.id, contentHtml: '<p>boil water</p>' });
    const n2 = repo.createNote({ title: 'Meeting', contentHtml: '<p>budget review</p>' });
    repo.setNoteTags(n2.id, ['work']);
    const titles = (q) => repo.listNotes({ search: q }).map((n) => n.title);
    expect(titles('pasta')).toEqual(['Pasta']);
    expect(titles('budget')).toEqual(['Meeting']);
    expect(titles('recipes')).toEqual(['Pasta']);
    expect(titles('WORK')).toEqual(['Meeting']);
    expect(titles('boil review')).toEqual([]); // every word must match
    expect(n1.id).toBeTruthy();
  });

  it('treats % and _ as literal characters', () => {
    repo.createNote({ title: '100% done' });
    repo.createNote({ title: 'abc' });
    expect(repo.listNotes({ search: '100%' })).toHaveLength(1);
    expect(repo.listNotes({ search: '%' })).toHaveLength(1);
  });

  it('adds, removes and filters by tags (case-insensitive, de-duplicated)', () => {
    const n = repo.createNote({ title: 'T' });
    expect(repo.setNoteTags(n.id, ['Work', 'work', '#Home', ' '])).toEqual(['Home', 'Work']);
    expect(repo.listTags()).toEqual([{ name: 'Home', note_count: 1 }, { name: 'Work', note_count: 1 }]);
    expect(repo.listNotes({ filter: { kind: 'tag', tag: 'WORK' } })).toHaveLength(1);
    repo.setNoteTags(n.id, ['Home']);
    expect(repo.listTags().map((x) => x.name)).toEqual(['Home']); // unused tag removed
    expect(() => repo.setNoteTags(n.id, ['a,b'])).toThrow(/commas/);
  });
});

describe('folders', () => {
  it('creates, renames and counts notes', () => {
    const f = repo.createFolder('Work');
    repo.createNote({ folderId: f.id });
    repo.createNote({ folderId: f.id });
    expect(repo.listFolders().find((x) => x.id === f.id).note_count).toBe(2);
    expect(repo.renameFolder(f.id, 'Office').name).toBe('Office');
    expect(() => repo.createFolder('office')).toThrow(/already exists/);
  });

  it('moves notes between folders', () => {
    const f = repo.createFolder('X');
    const n = repo.createNote({});
    repo.updateNote(n.id, { folder_id: f.id });
    expect(repo.getNote(n.id).folder_id).toBe(f.id);
  });

  it('deleting a non-empty folder moves its notes to the default folder', () => {
    const f = repo.createFolder('Temp');
    const n = repo.createNote({ folderId: f.id });
    const res = repo.deleteFolder(f.id, 'move');
    expect(res.movedNotes).toBe(1);
    expect(repo.getNote(n.id).folder_id).toBe('default');
  });

  it('can delete the notes together with the folder when asked', () => {
    const f = repo.createFolder('Temp');
    repo.createNote({ folderId: f.id });
    expect(repo.deleteFolder(f.id, 'delete').deletedNotes).toBe(1);
    expect(repo.listNotes()).toHaveLength(0);
  });

  it('never deletes the default folder', () => {
    expect(() => repo.deleteFolder('default')).toThrow(/default folder/);
  });
});

describe('settings and boards', () => {
  it('returns defaults, validates and persists settings', () => {
    expect(repo.getSettings().theme).toBe('system');
    expect(repo.setSettings({ theme: 'dark', defaultReminderMinutes: 30 }).theme).toBe('dark');
    expect(repo.getSettings().defaultReminderMinutes).toBe(30);
    expect(() => repo.setSettings({ theme: 'neon' })).toThrow();
    expect(() => repo.setSettings({ hacker: 1 })).toThrow(/Unknown field/);
  });

  it('stores board JSON and rejects invalid JSON', () => {
    const b = repo.createBoard('Ideas');
    repo.saveBoard(b.id, { data_json: JSON.stringify({ version: 1, objects: [] }) });
    expect(() => repo.saveBoard(b.id, { data_json: '{broken' })).toThrow(/not valid JSON/);
  });
});
