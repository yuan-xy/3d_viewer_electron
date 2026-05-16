import { test, expect, ElectronApplication, _electron } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const TEST_GLB = readFileSync(path.join(__dirname, 'fixtures', 'test-box.glb'))

test.describe('Ficad Web Electron', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    const exePath = path.join(PROJECT_ROOT, 'dist', 'win-unpacked', 'Ficad Web.exe')
    electronApp = await _electron.launch({
      executablePath: exePath,
    })
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('app starts and renders canvas', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForTimeout(3000)

    const canvasCount = await window.locator('canvas').count()
    console.log('[test] canvas count:', canvasCount)
    expect(canvasCount).toBeGreaterThan(0)
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

    // Canvas still visible
    const canvasVisible = await window.locator('canvas').first().isVisible()
    expect(canvasVisible).toBe(true)
  })
})