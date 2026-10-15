// Preload script. It runs in an isolated world before the web page loads and
// is the ONLY bridge between React and the main process.
//
// Rules followed here:
//  - a fixed allow-list of channels (no arbitrary channel names from React),
//  - ipcRenderer itself is never exposed,
//  - every call returns a Promise and failures become normal JS errors,
//  - event listeners receive plain data, never the Electron event object.
//
// NOTE: sandboxed preload scripts must be CommonJS and cannot require()
// local files, so the channel list lives in this single file.
const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = {
  notes: {
    list: "notes:list",
    get: "notes:get",
    create: "notes:create",
    update: "notes:update",
    remove: "notes:delete",
  },
  sidebar: { get: "sidebar:get" },
  folders: {
    create: "folders:create",
    rename: "folders:rename",
    remove: "folders:delete",
  },
  tags: { setForNote: "tags:setForNote" },
  attachments: {
    add: "attachments:add",
    remove: "attachments:remove",
    open: "attachments:open",
    reveal: "attachments:reveal",
  },
  boards: {
    create: "boards:create",
    get: "boards:get",
    save: "boards:save",
    remove: "boards:delete",
  },
  reminders: {
    list: "reminders:list",
    create: "reminders:create",
    dismiss: "reminders:dismiss",
    cancel: "reminders:cancel",
  },
  timers: {
    list: "timers:list",
    create: "timers:create",
    pause: "timers:pause",
    resume: "timers:resume",
    cancel: "timers:cancel",
    dismiss: "timers:dismiss",
  },
  settings: {
    get: "settings:get",
    set: "settings:set",
    chooseExportDir: "settings:chooseExportDir",
    testNotification: "settings:testNotification",
  },
  files: {
    exportNote: "files:exportNote",
    exportNotes: "files:exportNotes",
    exportBackup: "files:exportBackup",
    importPreview: "files:importPreview",
    importApply: "files:importApply",
    importTextFiles: "files:importTextFiles",
    saveImage: "files:saveImage",
  },
  data: {
    createBackup: "data:createBackup",
    listBackups: "data:listBackups",
    openBackupFolder: "data:openBackupFolder",
  },
  app: {
    getInfo: "app:getInfo",
    readyToClose: "app:readyToClose",
    openExternal: "app:openExternal",
  },
};

const EVENTS = ["scheduler:event", "app:beforeClose", "menu:action"];

function invoke(channel) {
  return async (payload) => {
    const res = await ipcRenderer.invoke(channel, payload);
    if (!res || res.ok !== true) {
      const err = new Error(
        (res && res.error && res.error.message) || "The request failed.",
      );
      err.code = (res && res.error && res.error.code) || "EUNKNOWN";
      throw err;
    }
    return res.data;
  };
}

const api = {};
for (const [group, methods] of Object.entries(CHANNELS)) {
  api[group] = {};
  for (const [name, channel] of Object.entries(methods)) {
    api[group][name] = invoke(channel);
  }
  Object.freeze(api[group]);
}

api.on = (eventName, callback) => {
  if (!EVENTS.includes(eventName) || typeof callback !== "function") {
    throw new Error(`Unknown event: ${String(eventName)}`);
  }
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(eventName, listener);
  return () => ipcRenderer.removeListener(eventName, listener);
};

api.platform = process.platform;

contextBridge.exposeInMainWorld("api", Object.freeze(api));
