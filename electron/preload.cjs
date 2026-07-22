const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arkDesktop', {
  generateImage: (payload) => ipcRenderer.invoke('ark:generateImage', payload),
  createVideoTask: (payload) => ipcRenderer.invoke('ark:createVideoTask', payload),
  getVideoTask: (payload) => ipcRenderer.invoke('ark:getVideoTask', payload),
  pickImage: () => ipcRenderer.invoke('file:pickImage'),
  downloadUrl: (payload) => ipcRenderer.invoke('file:downloadUrl', payload),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});
