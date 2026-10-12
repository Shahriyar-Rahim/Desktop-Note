import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const devServerUrl = app.isPackaged
  ? null
  : process.env.VITE_DEV_SERVER_URL || null;

  function createWindow() {
    const win = new BrowserWindow({
        width: 1100,
        height: 720,
        title: 'Desktop Notes',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    if(devServerUrl) win.loadURL(devServerUrl);
    else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  ipcMain.handle('app:ping', (_event, message) => {
    if(typeof message !== 'string' || message.length > 200) throw new Error('Invalid Message');
    return `pong: ${message} (main process, Node ${process.versions.node})`;
  })

  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => {
    if(process.platform !== 'darwin') app.quit();
  });