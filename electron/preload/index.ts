import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('electron:getAppVersion'),
  getPlatform: () => process.platform,
  openExternal: (url: string) => ipcRenderer.invoke('electron:openExternal', url),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('fs:readDirectory', dirPath),
  readFileAsBase64: (filePath: string) => ipcRenderer.invoke('fs:readFileAsBase64', filePath),
})

// Expose build info to renderer
contextBridge.exposeInMainWorld('env', {
  DEV: import.meta.env.DEV,
  PROD: !import.meta.env.DEV
})