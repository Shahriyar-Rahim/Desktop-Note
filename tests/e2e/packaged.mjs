// Smoke test for the PACKAGED application (no Vite server, code inside app.asar).
//   node tests/e2e/packaged.mjs release/linux-unpacked/desktop-notes
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';

const exe = path.resolve(process.argv[2] || 'release/linux-unpacked/desktop-notes');
if (!fs.existsSync(exe)) { console.error(`Executable not found: ${exe}`); process.exit(2); }
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-packaged-'));
const checks = [];
const check = (name, ok, extra = '') => { checks.push(ok); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };

const app = await electron.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--disable-gpu'],
  env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), APPDATA: home },
});
const page = await app.firstWindow();
await page.waitForSelector('text=All Notes', { timeout: 30000 });

check('window title', (await page.title()) === 'Desktop Notes');
const url = page.url();
check('loads the BUILT frontend from app.asar (not a dev server)', url.startsWith('file://') && url.includes('app.asar') && !url.includes('5173'), url);
const packaged = await app.evaluate(({ app: a }) => a.isPackaged);
check('app.isPackaged is true', packaged === true);
const info = await page.evaluate(() => window.api.app.getInfo());
check('IPC works and schema is up to date', info.version === '1.0.0' && info.schemaVersion === 3, JSON.stringify(info));
const isolated = await page.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined');
check('renderer has no Node.js access', isolated);
const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
check('Content-Security-Policy present', Boolean(csp && csp.includes("default-src 'self'")));

await page.getByRole('button', { name: 'New note' }).first().click();
await page.getByLabel('Note title').fill('Packaged note');
await page.getByTestId('editor').click();
await page.keyboard.type('hello from the installed app');
await page.waitForFunction(() => document.querySelector('[data-testid="save-status"]')?.textContent.includes('All changes saved'));
const notes = await page.evaluate(() => window.api.notes.list({}));
check('SQLite (native module from app.asar.unpacked) saves a note', notes.length === 1 && notes[0].title === 'Packaged note');

await app.close();
const dbFile = path.join(home, '.config', 'Desktop Notes', 'data', 'notes.db');
check('database file created in the per-user data folder', fs.existsSync(dbFile), dbFile);
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} packaged-app checks passed.`);
fs.rmSync(home, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
