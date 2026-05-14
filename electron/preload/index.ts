import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('electron:getAppVersion'),
  getPlatform: () => process.platform,
  openExternal: (url: string) => ipcRenderer.invoke('electron:openExternal', url)
})

// Expose build info to renderer
contextBridge.exposeInMainWorld('env', {
  DEV: import.meta.env.DEV,
  PROD: !import.meta.env.DEV
})