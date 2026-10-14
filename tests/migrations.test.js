import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import {
  migrate,
  LATEST_VERSION,
  migrations,
} from "../electron/services/migrations.js";

describe("migrations", () => {
  it("creates the full schema and a default folder on an empty database", () => {
    const db = new Database(":memory:");
    const applied = migrate(db);
    expect(applied).toEqual(migrations.map((m) => m.version));
    expect(db.pragma("user_version", { simple: true })).toBe(LATEST_VERSION);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .pluck()
      .all();
    for (const t of [
      "folders",
      "notes",
      "tags",
      "note_tags",
      "attachments",
      "settings",
      "reminders",
      "timers",
      "boards",
    ]) {
      expect(tables).toContain(t);
    }
    expect(
      db.prepare("SELECT name FROM folders WHERE is_default = 1").pluck().get(),
    ).toBe("Notes");
  });

  it("is idempotent: running twice applies nothing the second time", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(migrate(db)).toEqual([]);
  });

  it("upgrades an old database without losing data", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    // Simulate an app that only knew migration 1.
    db.transaction(() => {
      migrations[0].up(db);
      db.pragma("user_version = 1");
    })();
    db.prepare(
      "INSERT INTO notes (id, folder_id, title, created_at, updated_at) VALUES ('n1','default','Keep me',1,1)",
    ).run();
    expect(migrate(db)).toEqual([2, 3]);
    expect(
      db.prepare("SELECT title FROM notes WHERE id = ?").pluck().get("n1"),
    ).toBe("Keep me");
  });

  it("refuses a database that is newer than the app", () => {
    const db = new Database(":memory:");
    db.pragma(`user_version = ${LATEST_VERSION + 5}`);
    expect(() => migrate(db)).toThrow(/newer than this app/);
  });
});
