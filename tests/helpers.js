import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from '../electron/services/migrations.js';
import { Repo } from '../electron/services/repo.js';

export function tmpDir(prefix = 'notes-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// A fresh in-memory database with all migrations applied.
export function memoryRepo(clock) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return new Repo(db, clock ? { clock } : undefined);
}
