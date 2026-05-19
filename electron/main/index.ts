import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join, extname } from 'path'
import * as fs from 'fs'
import { ALL_EXTENSIONS } from '../../src/renderer/config/file-formats'

// Must be called before app.whenReady() to grant the custom protocol access to
// IndexedDB, fetch, and other standard web APIs.
protocol.registerSchemesAsPrivileged([
  { scheme: 'faicad-viewer', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

let mainWindow: BrowserWindow | null = null

function setupProtocol(): void {
  protocol.handle('faicad-viewer', (request) => {
    const url = new URL(request.url)
    const urlPath = decodeURIComponent(url.pathname)
    let rel: string
    if (urlPath.startsWith('/out/renderer/')) {
      rel = urlPath.slice('/out/renderer/'.length)
    } else {
      rel = urlPath.replace(/^\//, '')
    }
    const relWin = rel.replace(/\//g, '\\')

    // In dev mode, serve public assets (wasm etc.) from source tree
    if (import.meta.env.DEV) {
      const publicPath = join(__dirname, '..', '..', 'src', 'renderer', 'public', relWin)
      try {
        fs.accessSync(publicPath)
        return net.fetch('file:///' + publicPath.replace(/\\/g, '/'))
      } catch {
        // Fall through to asar path
      }
    }

    const asarPath = join(__dirname, '..', 'renderer', relWin)
    return net.fetch('file:///' + asarPath.replace(/\\/g, '/'))
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Faicad',
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

  mainWindow.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
    console.log('[Main] console[' + level + ']:', message)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (import.meta.env.DEV) {
    const devURL = process.env.ELECTRON_RENDERER_URL as string
    mainWindow.loadURL(devURL)
    console.log('[Main] loading (dev):', devURL)
  } else {
    mainWindow.loadURL('faicad-viewer://local/out/renderer/index.html')
    console.log('[Main] loading (prod): faicad-viewer://local/out/renderer/index.html')
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('electron:getAppVersion', () => app.getVersion())
ipcMain.handle('electron:openExternal', (_event, url: string) => shell.openExternal(url))

// File system IPC handlers
const SUPPORTED_EXTENSIONS = new Set(ALL_EXTENSIONS)

ipcMain.handle('fs:readDirectory', async (_event, dirPath: string) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const files: { name: string; path: string; mtimeMs: number }[] = []
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          const fullPath = join(dirPath, entry.name)
          const stat = await fs.promises.stat(fullPath)
          files.push({ name: entry.name, path: fullPath, mtimeMs: stat.mtimeMs })
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