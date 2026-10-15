# Desktop Notes

A local-first desktop note-taking app built with **Electron + React + Vite + Tailwind CSS + JavaScript**.
Notes, folders, tags, checklists, attachments, reminders, timers and a freeform drawing board are stored
in a local SQLite database. No server, no account, no internet connection required.

## Requirements

- Node.js 22 LTS or newer (`node -v`) and npm 10+ (`npm -v`)
- Linux, Windows or macOS
- Linux only: a desktop session (X11 or Wayland). For headless machines use `xvfb-run`.

## Install and run (development)

```bash
npm install
npm run dev        # starts Vite + opens the Electron window with hot reload
```

## Run the built app (production mode, without the Vite server)

```bash
npm start          # = npm run build && electron .
```

## Tests

```bash
npm test           # unit + integration tests (Vitest)
npm run test:e2e   # launches the real Electron app and drives the UI (Playwright)
# on a machine without a display:
xvfb-run -a npm run test:e2e
```

## Package an installable program

```bash
npm run pack       # unpacked app in release/linux-unpacked (fast sanity check)
npm run dist       # Linux: AppImage + deb in release/
npm run dist:win   # Windows installer (run this on Windows)
npm run dist:mac   # macOS dmg (run this on a Mac)
```

Build each platform on that platform: native modules and installers are platform specific.

## Where is my data?

Electron's per-user application-data folder (`app.getPath('userData')`):

| OS | Folder |
|----|--------|
| Linux | `~/.config/Desktop Notes/` |
| Windows | `%APPDATA%\Desktop Notes\` |
| macOS | `~/Library/Application Support/Desktop Notes/` |

Inside: `data/notes.db` (SQLite), `attachments/`, `backups/`.

## Data safety and recovery

- Automatic database backup once a day, on exit (when the newest backup is over 6 hours old), before every schema upgrade and before every import (10 newest kept).
- Settings -> Data safety -> *Back up database now* / *Open backup folder*.
- If `notes.db` is damaged the app moves it aside as `notes.db.corrupt-<time>` (never deleted), restores the
  newest backup that opens cleanly and shows a banner. To restore manually: close the app and copy a file
  from `backups/` over `data/notes.db`.
- *Export all notes* creates a portable JSON backup (including attachments) that can be imported on any machine.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + N | New note |
| Ctrl/Cmd + Shift + N | New folder |
| Ctrl/Cmd + S | Save now (auto-save already runs) |
| Ctrl/Cmd + F | Search |
| Ctrl/Cmd + E | Export current note |
| Ctrl/Cmd + B / I / U | Bold / italic / underline |
| Ctrl/Cmd + Z / Shift + Z | Undo / redo (editor and drawing board) |
| Delete | Delete selected note(s) - only when the note list has focus, always asks first |
| Ctrl/Cmd + Shift + D | Toggle dark mode |
| Ctrl/Cmd + Shift + R | Reminders and timers |
| Ctrl/Cmd + , | Settings |

## Project layout

```
electron/   main process: window, menu, IPC handlers, SQLite, scheduler, import/export, security
  main.js  preload.cjs  menu.js
  ipc/        one file per feature area
  services/   database, migrations, repo (all SQL), scheduler, attachments, exporter, importer
  security/   validation, safe paths, IPC guard, errors
src/        renderer: React UI
  components/  hooks/  features/{editor,canvas}/  storage/  services/  utils/
tests/      Vitest unit tests + tests/e2e (Playwright driving real Electron)
```

## Known limitations

- Reminders and timers only fire while the app is running (no background service). Reminders that expire
  while the app is closed are shown as "Missed" at the next start.
- Search is a simple substring search (SQLite `LIKE`): it is case-insensitive for ASCII letters only.
- Imported Markdown is converted to the editor's format; unusual Markdown constructs (tables, footnotes) are simplified.
- Installers for Windows and macOS must be built on those systems.
