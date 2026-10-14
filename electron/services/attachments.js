export const DEFAULT_FOLDER_ID = "default";

export const migrations = [
  {
    version: 1,
    name: "notes, folders, tags, attachments, settings",
    up(db) {
      db.exec(`
        CREATE TABLE folders (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX idx_folders_name ON folders(name COLLATE NOCASE);

        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE RESTRICT,
          title TEXT NOT NULL DEFAULT '',
          content_html TEXT NOT NULL DEFAULT '',
          content_text TEXT NOT NULL DEFAULT '',
          pinned INTEGER NOT NULL DEFAULT 0,
          favorite INTEGER NOT NULL DEFAULT 0,
          urgent INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_notes_folder ON notes(folder_id);
        CREATE INDEX idx_notes_updated ON notes(updated_at);

        CREATE TABLE tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE
        );
        CREATE TABLE note_tags (
          note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY (note_id, tag_id)
        );
        CREATE INDEX idx_note_tags_tag ON note_tags(tag_id);

        CREATE TABLE attachments (
          id TEXT PRIMARY KEY,
          note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          original_name TEXT NOT NULL,
          stored_name TEXT NOT NULL,
          mime TEXT NOT NULL,
          size INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_attachments_note ON attachments(note_id);

        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      const t = Date.now();
      db.prepare(
        "INSERT INTO folders (id, name, is_default, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      ).run(DEFAULT_FOLDER_ID, "Notes", t, t);
    },
  },
  {
    version: 2,
    name: "reminders and timers",
    up(db) {
      db.exec(`
        CREATE TABLE reminders (
          id TEXT PRIMARY KEY,
          note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          due_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending','fired','missed','dismissed','cancelled')),
          created_at INTEGER NOT NULL,
          fired_at INTEGER
        );
        CREATE INDEX idx_reminders_due ON reminders(status, due_at);

        CREATE TABLE timers (
          id TEXT PRIMARY KEY,
          note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
          label TEXT NOT NULL,
          duration_ms INTEGER NOT NULL,
          remaining_ms INTEGER NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('running','paused','done','cancelled')),
          ends_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
  {
    version: 3,
    name: "drawing boards",
    up(db) {
      db.exec(`
        CREATE TABLE boards (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          data_json TEXT NOT NULL DEFAULT '{"version":1,"objects":[]}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
];

export const LATEST_VERSION = migrations[migrations.length - 1].version;

// Apply all pending migrations inside one transaction each.
// Returns the list of versions that were applied.
export function migrate(db) {
  const current = db.pragma("user_version", { simple: true });
  if (current > LATEST_VERSION) {
    throw new Error(
      `Database version ${current} is newer than this app supports (${LATEST_VERSION}). Update the app.`,
    );
  }
  const applied = [];
  for (const m of migrations) {
    if (m.version <= current) continue;
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
    applied.push(m.version);
  }
  return applied;
}
