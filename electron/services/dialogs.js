// Thin wrapper around Electron's native dialogs.
// In automated tests (never in a packaged app) answers can be pre-recorded
// through the NOTES_TEST_DIALOGS environment variable: a JSON array whose items
// are consumed one by one, e.g. ["/tmp/out.md", null].
export function createDialogs({ dialog, getWindow, allowTestMode }) {
  const queue = [];
  if (allowTestMode && process.env.NOTES_TEST_DIALOGS) {
    try { queue.push(...JSON.parse(process.env.NOTES_TEST_DIALOGS)); } catch { /* ignore */ }
  }
  const useQueue = allowTestMode && queue.length > 0;
  const next = () => (queue.length ? queue.shift() : null);

  return {
    async save({ title, defaultPath, filters }) {
      if (useQueue) return next();
      const res = await dialog.showSaveDialog(getWindow(), { title, defaultPath, filters });
      return res.canceled || !res.filePath ? null : res.filePath;
    },
    async openFiles({ title, filters, multi = true }) {
      if (useQueue) {
        const r = next();
        return Array.isArray(r) ? r : r ? [r] : [];
      }
      const res = await dialog.showOpenDialog(getWindow(), {
        title,
        filters,
        properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      });
      return res.canceled ? [] : res.filePaths;
    },
    async openDirectory({ title, defaultPath }) {
      if (useQueue) return next();
      const res = await dialog.showOpenDialog(getWindow(), {
        title,
        defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
    },
  };
}
