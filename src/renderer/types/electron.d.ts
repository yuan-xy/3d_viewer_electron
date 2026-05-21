export {}

declare global {
  interface Window {
    __errors: { message: string; stack: string; timestamp: number }[]
    electronAPI: {
      getAppVersion: () => Promise<string>
      getPlatform: () => string
      openExternal: (url: string) => Promise<void>
      readDirectory: (dirPath: string) => Promise<{
        success: boolean
        files?: { name: string; path: string; mtimeMs: number }[]
        error?: string
      }>
      readFile: (filePath: string) => Promise<{
        success: boolean
        data?: ArrayBuffer
        error?: string
      }>
      readFileAsBase64: (filePath: string) => Promise<{
        success: boolean
        data?: string
        error?: string
      }>
      getFilePath: (file: File) => string
      openFileDialog: () => Promise<{
        success: boolean
        filePaths?: string[]
        error?: string
      }>
      toggleFullscreen: () => Promise<boolean>
      onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => () => void
    }
    env: {
      DEV: boolean
      PROD: boolean
    }
  }
}