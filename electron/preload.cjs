const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    ping: (message) => ipcRenderer.invoke('app:ping', message),
});