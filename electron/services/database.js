import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrate, LATEST_VERSION } from "./migrations.js";

const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, "-");

function openAndCheck(dbPath) {
  const db = new Database(dbPath);
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 3000");
    const result = db.pragma("quick_check", { simple: true });
    if (result !== "ok") throw new Error(`quick_check failed: ${result}`);
    return db;
  } catch (error) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    throw error;
  }
}

export function listBackups(backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((f) => /^notes-.*\.db$/.test(f))
    .map((f) => {
      const full = path.join(backupDir, f);
      return {
        name: f,
        path: full,
        mtime: fs.statSync(full).mtimeMs,
        size: fs.statSync(full).size,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function createBackup(db, backupDir, label = "auto") {
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `notes-${label}-${stamp()}.db`);
  db.prepare("VACUUM INTO ?").run(target);
  return target;
}

export function pruneBackups(backupDir, keep = 10) {
  const all = listBackups(backupDir);
  for (const old of all.slice(keep)) {
    try {
      fs.unlinkSync(old.path);
    } catch {
      /* best effort */
    }
  }
}

export function maybeBackup(db, backupDir, minAgeMs, label = "auto") {
  const newest = listBackups(backupDir)[0];
  if (newest && Date.now() - newest.mtime <= minAgeMs) return null;
  const file = createBackup(db, backupDir, label);
  pruneBackups(backupDir, 10);
  return file;
}

function moveAside(dbPath, reason) {
  const corruptPath = `${dbPath}.corrupt-${stamp()}`;
  fs.renameSync(dbPath, corruptPath);
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(dbPath + suffix)) {
      try {
        fs.renameSync(dbPath + suffix, corruptPath + suffix);
      } catch {
        /* ignore */
      }
    }
  }
  return { corruptPath, reason };
}

// Open the database with recovery:
//   1. If the file opens and passes quick_check -> use it.
//   2. Otherwise move the damaged file aside (never delete it), then try the
//      newest backup that opens cleanly, else start with an empty database.
// Returns { db, recovery } where recovery is null or a description.
export function openDatabase(dbPath, { backupDir, backupIntervalMs = 24 * 3600 * 1000 } = {}) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  let recovery = null;
  let db = null;

  if (fs.existsSync(dbPath)) {
    try {
      db = openAndCheck(dbPath);
    } catch (err) {
      const moved = moveAside(dbPath, err.message);
      recovery = { reason: err.message, corruptFile: moved.corruptPath, restoredFrom: null };
    }
  }

  if (!db && recovery && backupDir) {
    for (const backup of listBackups(backupDir)) {
      try {
        fs.copyFileSync(backup.path, dbPath);
        db = openAndCheck(dbPath);
        recovery.restoredFrom = backup.path;
        break;
      } catch {
        try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
        db = null;
      }
    }
  }

  if (!db) db = openAndCheck(dbPath); // fresh, empty database

  const before = db.pragma('user_version', { simple: true });
  const hasData = before > 0;
  if (hasData && before < LATEST_VERSION && backupDir) {
    createBackup(db, backupDir, `before-v${LATEST_VERSION}`);
  }
  migrate(db);

  if (backupDir) maybeBackup(db, backupDir, backupIntervalMs, 'auto');
  return { db, recovery };
}