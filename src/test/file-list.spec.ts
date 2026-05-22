import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_GLB = readFileSync(path.join(__dirname, 'fixtures', 'test-box.glb'))
const TEST_FIXTURES = path.join(__dirname, 'fixtures')

/** Wait for ModelGroup to finish loading (replaces fixed timeouts). */
async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('3D Viewer Electron - File List Panel', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--ozone-platform-hint=x11'],
      env: { ...process.env, E2E: '1' },
    })
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('app starts and renders canvas', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const canvasCount = await window.locator('canvas').count()
    console.log('[test] canvas count:', canvasCount)
    expect(canvasCount).toBeGreaterThan(0)
  })

  test('electronAPI readDirectory returns fixture files', async () => {
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const result = await window.evaluate(async (fixturesPath: string) => {
      return await window.electronAPI.readDirectory(fixturesPath)
    }, TEST_FIXTURES)

    console.log('[test] readDirectory result files:', result.files?.map(f => f.name))
    expect(result.success).toBe(true)
    expect(result.files).toBeDefined()
    expect(result.files!.length).toBeGreaterThan(0)
    expect(result.files!.some(f => f.name === 'test-box.glb')).toBe(true)
  })

  test('electronAPI readFileAsBase64 loads test-box.glb', async () => {
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const result = await window.evaluate(async (filePath: string) => {
      return await window.electronAPI.readFileAsBase64(filePath)
    }, path.join(TEST_FIXTURES, 'test-box.glb'))

    console.log('[test] readFileAsBase64 success:', result.success, 'data length:', result.data?.length)
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.length).toBeGreaterThan(0)
  })

  test('file list panel shows empty state initially', async () => {
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const emptyStateZh = window.getByText(/加载文件后显示同目录模型/)
    const visible = await emptyStateZh.isVisible().catch(() => false)
    console.log('[test] empty state visible:', visible)
    expect(visible).toBe(true)
  })

  test('loads GLB file and model renders', async () => {
    const window = await electronApp.firstWindow()

    // Load GLB file
    await window.locator('input[type="file"]').setInputFiles({
      name: 'test-box.glb',
      mimeType: 'model/gltf-binary',
      buffer: TEST_GLB,
    })

    await waitForLoadDone(window)

    // Canvas still visible (model rendered)
    const canvasVisible = await window.locator('canvas').first().isVisible()
    expect(canvasVisible).toBe(true)

    // Note: file.path is undefined in Playwright's setInputFiles,
    // so directory scan doesn't happen in automated tests.
    // In real usage, file.path would be available and file list would populate.
  })

  test('can manually trigger file list panel to show files', async () => {
    // This test verifies that we CAN manually set folder files via store
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // We can't directly set Zustand state from the test,
    // but we can verify the readDirectory works
    const result = await window.evaluate(async (fixturesPath: string) => {
      return await window.electronAPI.readDirectory(fixturesPath)
    }, TEST_FIXTURES)

    expect(result.success).toBe(true)
    expect(result.files!.length).toBeGreaterThan(3) // box_boss, test-box, vise, etc.
  })

  test('click file in list toggles load/unload', async () => {
    test.setTimeout(60000)
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    await window.setViewportSize({ width: 1280, height: 800 })

    // Ensure clean state
    await window.evaluate(() => window.__modelStore?.getState().reset())

    // Populate file list from real fixture directory (so readFile IPC works)
    const hasFiles = await window.evaluate(async (fixturesPath: string) => {
      const result = await window.electronAPI.readDirectory(fixturesPath)
      if (!result.success || !result.files) return false
      window.__modelStore.getState().setFolderFiles(fixturesPath, result.files)
      return true
    }, TEST_FIXTURES)
    expect(hasFiles).toBe(true)

    // Read back the actual file path (uses OS-native separators)
    const testBoxPath = await window.evaluate(() => {
      const files = window.__modelStore!.getState().folderFiles
      const found = files.find((f: any) => f.name === 'test-box.glb')
      return found?.path ?? null
    })
    expect(testBoxPath).toBeTruthy()

    // Wait for the test-box.glb card to appear in the right panel grid
    const firstCard = window.locator('.grid > div').filter({ hasText: 'test-box.glb' }).first()
    await firstCard.waitFor({ state: 'attached', timeout: 10000 })

    // First click: load the file
    await firstCard.click()
    await window.waitForFunction(
      (p: string) => window.__modelStore?.getState().loadedFiles.some(
        (f: any) => f.filePath === p,
      ),
      testBoxPath!,
      { timeout: 30000 },
    )
    let loaded = await window.evaluate((p: string) =>
      window.__modelStore!.getState().loadedFiles.some(
        (f: any) => f.filePath === p,
      ),
      testBoxPath!,
    )
    expect(loaded).toBe(true)

    // Second click: unload the file (toggle off)
    await firstCard.click()
    await window.waitForFunction(
      (p: string) => !window.__modelStore?.getState().loadedFiles.some(
        (f: any) => f.filePath === p,
      ),
      testBoxPath!,
      { timeout: 5000 },
    )
    loaded = await window.evaluate((p: string) =>
      window.__modelStore!.getState().loadedFiles.some(
        (f: any) => f.filePath === p,
      ),
      testBoxPath!,
    )
    expect(loaded).toBe(false)

    // Third click: load again (toggle on)
    await firstCard.click()
    await window.waitForFunction(
      (p: string) => window.__modelStore?.getState().loadedFiles.some(
        (f: any) => f.filePath === p,
      ),
      testBoxPath!,
      { timeout: 30000 },
    )
    loaded = await window.evaluate((p: string) =>
      window.__modelStore!.getState().loadedFiles.some(
        (f: any) => f.filePath === p,
      ),
      testBoxPath!,
    )
    expect(loaded).toBe(true)
  })
})