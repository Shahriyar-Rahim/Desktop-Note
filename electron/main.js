import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Notification,
  nativeTheme,
  protocol,
  net,
  session,
  Menu,
} from "electron";
import { openDatabase, maybeBackup } from "./services/database.js";
import { LATEST_VERSION } from "./services/migrations.js";
import { Repo } from "./services/repo.js";
import { Scheduler } from "./services/scheduler.js";
import { resolveAttachmentPath } from "./services/attachments.js";
import { createDialogs } from "./services/dialogs.js";
import { createTrustChecker, createGuardedHandle } from "./security/guard.js";
import { registerIpc } from "./ipc/index.js";
import { buildMenu } from "./menu.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// environment
const isDev = !app.isPackaged;
const devServerUrl = isDev ? process.env.VITE_DEV_SERVER_URL || null : null;
const isTestMode = isDev && process.env.NOTES_E2E === "1";
const indexFile = path.join(__dirname, "..", "dist", "index.html");

// A custom scheme that lets <img src="note-file://attachment/ID"> show
// attachments without ever exposing file paths to the page.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "note-file",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

if (isTestMode && process.env.NOTES_USER_DATA) {
  app.setPath("userData", process.env.NOTES_USER_DATA);
}

if (!isTestMode && !app.requestSingleInstanceLock()) {
  app.quit();
}

// state ekhane
let mainWindow = null;
let forceClose = false;
let repo = null;
let db = null;
let scheduler = null;
let recoveryNotice = null;

const paths = {};

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send(channel, data);
}

function notify({ title, body }) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

async function renderPdf(html) {
  const tmp = path.join(
    app.getPath("temp"),
    `desktop-notes-print-${randomUUID()}.html`,
  );
  await fs.promises.writeFile(tmp, html, "utf8");
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      javascript: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  try {
    await win.loadFile(tmp);
    return await win.webContents.printToPDF({
      pageSize: "A4",
      margins: { top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 },
    });
  } finally {
    win.destroy();
    fs.promises.rm(tmp, { force: true }).catch(() => {});
  }
}

// window ekhane
function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    show: false,
    title: "Desktop Notes",
    backgroundColor: dark ? "#1c1917" : "#fafaf9",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Links open in the system browser; the app window never navigates away.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );

  // Give the renderer a chance to save pending edits before the window closes.
  mainWindow.on("close", (event) => {
    if (forceClose) return;
    event.preventDefault();
    send("app:beforeClose");
    setTimeout(() => {
      forceClose = true;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    }, 4000); // safety net if the renderer is frozen
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(indexFile);
  }
}

const isTrustedUrl = createTrustChecker({
  devServerUrl,
  indexFileUrl: pathToFileURL(indexFile).href,
});

// app start hoy ekhane
async function start() {
  const userData = app.getPath("userData");
  paths.dbPath = path.join(userData, "data", "notes.db");
  paths.attachmentsDir = path.join(userData, "attachments");
  paths.backupDir = path.join(userData, "backups");
  fs.mkdirSync(paths.attachmentsDir, { recursive: true });

  const opened = openDatabase(paths.dbPath, { backupDir: paths.backupDir });
  db = opened.db;
  recoveryNotice = opened.recovery
    ? {
        reason: opened.recovery.reason,
        restoredFromBackup: Boolean(opened.recovery.restoredFrom),
        corruptFileName: path.basename(opened.recovery.corruptFile),
      }
    : null;
  repo = new Repo(db);
  nativeTheme.themeSource = repo.getSettings().theme;

  // Deny every browser permission request (camera, geolocation, ...).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) =>
    cb(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  protocol.handle("note-file", (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "attachment")
        return new Response("Not found", { status: 404 });
      const id = decodeURIComponent(url.pathname.slice(1));
      const { full, row } = resolveAttachmentPath(
        repo,
        paths.attachmentsDir,
        id,
      );
      if (!row.mime.startsWith("image/"))
        return new Response("Forbidden", { status: 403 });
      return net.fetch(pathToFileURL(full).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  scheduler = new Scheduler({
    repo,
    notify,
    emit: (event) => send("scheduler:event", event),
    getSettings: () => repo.getSettings(),
  });

  const dialogs = createDialogs({
    dialog,
    getWindow: () => mainWindow,
    allowTestMode: isTestMode,
  });
  const handle = createGuardedHandle(ipcMain, isTrustedUrl);
  registerIpc(handle, {
    repo,
    db,
    paths,
    dialogs,
    shell,
    notify,
    renderPdf,
    documentsDir: () => app.getPath("documents"),
    onSettingsChanged: (s) => {
      nativeTheme.themeSource = s.theme;
    },
    requestClose: () => {
      forceClose = true;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    },
    appInfo: () => ({
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron,
      schemaVersion: LATEST_VERSION,
      notificationsSupported: Notification.isSupported(),
      recovery: recoveryNotice,
    }),
  });

  Menu.setApplicationMenu(
    buildMenu({ send, isDev, platform: process.platform }),
  );
  createWindow();
  scheduler.start();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app
  .whenReady()
  .then(start)
  .catch((err) => {
    console.error("Startup failed:", err);
    dialog.showErrorBox(
      "Desktop Notes could not start",
      String(err && err.message ? err.message : err),
    );
    app.exit(1);
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && repo) {
    forceClose = false;
    createWindow();
  }
});

// IMPORTANT: close the database on 'will-quit', not 'before-quit'.
// 'before-quit' fires BEFORE the window has flushed its pending edits (see the
// close handshake in createWindow); closing the database there would make
// that last save fail.
app.on("will-quit", () => {
  if (scheduler) scheduler.stop();
  try {
    // Safety net: if the newest backup is older than 6 hours, take one now.
    if (db && db.open)
      maybeBackup(db, paths.backupDir, 6 * 3600 * 1000, "exit");
  } catch (err) {
    console.error("[backup] exit backup failed", err);
  }
  try {
    if (db && db.open) db.close();
  } catch {
    /* ignore */
  }
});
