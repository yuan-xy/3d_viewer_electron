export {}

declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>
      getPlatform: () => string
      openExternal: (url: string) => Promise<void>
      readDirectory: (dirPath: string) => Promise<{
        success: boolean
        files?: { name: string; path: string }[]
        error?: string
      }>
      readFileAsBase64: (filePath: string) => Promise<{
        success: boolean
        data?: string
        error?: string
      }>
    }
    env: {
      DEV: boolean
      PROD: boolean
    }
  }
}