import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { tmpDir } from "./helpers.js";
import {
  openDatabase,
  createBackup,
  listBackups,
  pruneBackups,
  maybeBackup,
} from "../electron/services/database.js";
import { Repo } from "../electron/services/repo.js";
import { migrations, LATEST_VERSION } from "../electron/services/migrations.js";

function makeDb(dir, title = "Important") {
  const dbPath = path.join(dir, "data", "notes.db");
  const backupDir = path.join(dir, "backups");
  const { db } = openDatabase(dbPath, { backupDir });
  new Repo(db).createNote({ title });
  return { db, dbPath, backupDir };
}

describe("database persistence and recovery", () => {
  it("keeps data after the database is closed and reopened (restart)", () => {
    const dir = tmpDir();
    const a = makeDb(dir);
    a.db.close();
    const b = openDatabase(a.dbPath, { backupDir: a.backupDir });
    expect(b.recovery).toBeNull();
    expect(new Repo(b.db).listNotes().map((n) => n.title)).toEqual([
      "Important",
    ]);
    b.db.close();
  });

  it("creates a first automatic backup and can prune old ones", () => {
    const dir = tmpDir();
    const a = makeDb(dir);
    expect(listBackups(a.backupDir)).toHaveLength(1);
    for (let i = 0; i < 4; i++) createBackup(a.db, a.backupDir, `extra${i}`);
    pruneBackups(a.backupDir, 2);
    expect(listBackups(a.backupDir)).toHaveLength(2);
    a.db.close();
  });

  it("moves a corrupted file aside and restores the newest backup", () => {
    const dir = tmpDir();
    const a = makeDb(dir, "Saved before crash");
    createBackup(a.db, a.backupDir, "manual");
    a.db.close();
    fs.writeFileSync(
      a.dbPath,
      Buffer.from("this is definitely not a sqlite database file".repeat(50)),
    );
    for (const s of ["-wal", "-shm"]) fs.rmSync(a.dbPath + s, { force: true });

    const r = openDatabase(a.dbPath, { backupDir: a.backupDir });
    expect(r.recovery).not.toBeNull();
    expect(r.recovery.restoredFrom).toBeTruthy();
    expect(fs.existsSync(r.recovery.corruptFile)).toBe(true); // never deleted
    expect(new Repo(r.db).listNotes().map((n) => n.title)).toEqual([
      "Saved before crash",
    ]);
    r.db.close();
  });

  it("starts a fresh database (keeping the damaged file) when no backup exists", () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, "data", "notes.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, Buffer.from("garbage".repeat(100)));
    const r = openDatabase(dbPath, { backupDir: path.join(dir, "backups") });
    expect(r.recovery.restoredFrom).toBeNull();
    expect(fs.existsSync(r.recovery.corruptFile)).toBe(true);
    expect(new Repo(r.db).listNotes()).toEqual([]);
    r.db.close();
  });

  it("takes a backup before upgrading an older database and keeps its data", () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, "data", "notes.db");
    const backupDir = path.join(dir, "backups");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    // Build a genuine "version 1" database, as an older app release would have left it.
    const old = new Database(dbPath);
    old.transaction(() => {
      migrations[0].up(old);
      old.pragma("user_version = 1");
    })();
    old
      .prepare(
        "INSERT INTO notes (id, folder_id, title, created_at, updated_at) VALUES ('n1','default','From v1',1,1)",
      )
      .run();
    old.close();

    const { db } = openDatabase(dbPath, { backupDir });
    expect(db.pragma("user_version", { simple: true })).toBe(LATEST_VERSION);
    expect(new Repo(db).listNotes().map((n) => n.title)).toEqual(["From v1"]);
    expect(
      listBackups(backupDir).some((b) =>
        b.name.includes(`before-v${LATEST_VERSION}`),
      ),
    ).toBe(true);
    db.close();
  });

  it("maybeBackup only creates a backup when the newest one is old enough", () => {
    const dir = tmpDir();
    const a = makeDb(dir);
    expect(maybeBackup(a.db, a.backupDir, 6 * 3600 * 1000, "exit")).toBeNull(); // first backup is fresh
    const old = listBackups(a.backupDir)[0].path;
    const past = new Date(Date.now() - 7 * 3600 * 1000);
    fs.utimesSync(old, past, past);
    expect(maybeBackup(a.db, a.backupDir, 6 * 3600 * 1000, "exit")).toContain(
      "notes-exit-",
    );
    a.db.close();
  });
});
