import { app, shell, BrowserWindow, ipcMain, protocol } from 'electron'
import { join, extname, dirname } from 'path'
import * as fs from 'fs'

let mainWindow: BrowserWindow | null = null

function setupProtocol(): void {
  // Intercept file:// protocol to serve from asar
  // Works with custom ficad-app:// URLs that get converted to file:// internally
  protocol.registerFileProtocol('ficad-app', (request, callback) => {
    try {
      const url = new URL(request.url)
      const urlPath = decodeURIComponent(url.pathname)
      // ficad-app://local/out/renderer/index.html -> /out/renderer/index.html
      const rel = urlPath.replace(/^\/out\/renderer\//, '')
      const asarPath = join(__dirname, '..', 'renderer', rel.replace(/\//g, '\\'))
      const ext = extname(asarPath)
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.json': 'application/json',
        '.glb': 'model/gltf-binary',
      }
      callback({ path: asarPath, headers: { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' } })
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string }
      console.error('[Protocol] error:', err?.message, err?.code)
      callback({ error: -2 })
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Ficad',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    console.log('[Main] ready-to-show, showing window')
    mainWindow!.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] did-finish-load')
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log('[Main] console[' + level + ']:', message)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadURL('ficad-app://local/out/renderer/index.html')
  console.log('[Main] loading: ficad-app://local/out/renderer/index.html')

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('electron:getAppVersion', () => app.getVersion())
ipcMain.handle('electron:openExternal', (_event, url: string) => shell.openExternal(url))

// File system IPC handlers
const SUPPORTED_EXTENSIONS = new Set(['.stl', '.glb', '.3mf', '.step', '.stp'])

ipcMain.handle('fs:readDirectory', async (_event, dirPath: string) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const files: { name: string; path: string }[] = []
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          files.push({ name: entry.name, path: join(dirPath, entry.name) })
        }
      }
    }
    return { success: true, files }
  } catch (e) {
    const err = e as Error
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:readFileAsBase64', async (_event, filePath: string) => {
  try {
    const buffer = await fs.promises.readFile(filePath)
    return { success: true, data: buffer.toString('base64') }
  } catch (e) {
    const err = e as Error
    return { success: false, error: err.message }
  }
})

app.whenReady().then(() => {
  console.log('[Main] app ready')
  setupProtocol()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})