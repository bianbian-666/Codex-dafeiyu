const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  status: () => ipcRenderer.invoke('pet:status'),
  action: (action, message) => ipcRenderer.invoke('pet:action', action, message),
});
