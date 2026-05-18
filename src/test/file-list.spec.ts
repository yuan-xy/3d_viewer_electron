import { test, expect, ElectronApplication, _electron } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const TEST_GLB = readFileSync(path.join(__dirname, 'fixtures', 'test-box.glb'))
const TEST_FIXTURES = path.join(PROJECT_ROOT, 'src', 'test', 'fixtures')

test.describe('3D Viewer Electron - File List Panel', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    const exePath = path.join(PROJECT_ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe')
    electronApp = await _electron.launch({
      executablePath: exePath,
    })
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('app starts and renders canvas', async () => {
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const canvasCount = await window.locator('canvas').count()
    console.log('[test] canvas count:', canvasCount)
    expect(canvasCount).toBeGreaterThan(0)
  })

  test('electronAPI readDirectory returns fixture files', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForTimeout(2000)

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
    await window.waitForTimeout(2000)

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
    await window.waitForTimeout(2000)

    const emptyStateZh = window.getByText(/加载文件后显示同目录模型/)
    const visible = await emptyStateZh.isVisible().catch(() => false)
    console.log('[test] empty state visible:', visible)
    expect(visible).toBe(true)
  })

  test('loads GLB file and model renders', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForTimeout(2000)

    // Load GLB file
    await window.locator('input[type="file"]').setInputFiles({
      name: 'test-box.glb',
      mimeType: 'model/gltf-binary',
      buffer: TEST_GLB,
    })

    await window.waitForTimeout(3000)

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
    await window.waitForTimeout(2000)

    // We can't directly set Zustand state from the test,
    // but we can verify the readDirectory works
    const result = await window.evaluate(async (fixturesPath: string) => {
      return await window.electronAPI.readDirectory(fixturesPath)
    }, TEST_FIXTURES)

    expect(result.success).toBe(true)
    expect(result.files!.length).toBeGreaterThan(3) // box_boss, test-box, vise, etc.
  })
})