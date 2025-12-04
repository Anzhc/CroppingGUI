const { contextBridge, ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readImages: (dirPath) => ipcRenderer.invoke('read-images', dirPath),
  listCrops: (dirPath) => ipcRenderer.invoke('list-crops', dirPath),
  saveCrops: (payload) => ipcRenderer.invoke('save-crops', payload),
  deleteCrop: (filePath) => ipcRenderer.invoke('delete-crop', filePath),
  toFileUrl: (filePath) => pathToFileURL(filePath).href,
});
