// jsdom environment setup for component tests & format loader tests
// Mocks browser APIs not provided by jsdom
// Guarded: when @vitest-environment node is used, window is not defined

if (typeof window !== 'undefined') {
  // Mock electronAPI
  ;(window as Record<string, unknown>).electronAPI = {
    readDirectory: async () => [],
    readFile: async () => ({ success: true, data: new ArrayBuffer(0) }),
    readFileAsBase64: async () => '',
    getFilePath: (file: File) => (file as unknown as { path?: string }).path ?? '',
    getAppVersion: async () => '1.0.0',
    openExternal: async () => {},
    openFileDialog: async () => ({ success: true, filePaths: [] }),
    toggleFullscreen: async () => true,
    onFullscreenChanged: () => () => {},
  }

  // Mock env
  ;(window as Record<string, unknown>).env = { DEV: true, PROD: false }
}

// Mock URL.createObjectURL / revokeObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  // @ts-expect-error jsdom may not implement these
  URL.createObjectURL = () => 'blob:mock'
  // @ts-expect-error jsdom may not implement these
  URL.revokeObjectURL = () => {}
}

// jsdom provides DOMParser, but some Three.js loaders access document.createElement / Image
// jsdom provides these already — ensure they exist
if (typeof globalThis.Image === 'undefined') {
  // @ts-expect-error minimal Image mock for Three.js texture loaders
  globalThis.Image = class {
    onload: (() => void) | null = null
    src = ''
    width = 1
    height = 1
  }
}
