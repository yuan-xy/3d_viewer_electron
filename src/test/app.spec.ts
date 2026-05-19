import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const TEST_GLB = readFileSync(path.join(__dirname, 'fixtures', 'test-box.glb'))

/** Collect page errors and return an assertion helper that fails on any error. */
function trackErrors(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  return {
    async assertNoErrors() {
      const appErrors = await page.evaluate(() =>
        window.__errors.map((e) => `${e.message}\n${e.stack}`),
      )
      const all = [...pageErrors, ...appErrors]
      expect(all, `Unexpected errors detected:\n${all.join('\n')}`).toEqual([])
    },
  }
}

/** Wait for ModelGroup to finish loading (replaces fixed timeouts). */
async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('3D Viewer Electron', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    const exePath = path.join(PROJECT_ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe')
    electronApp = await _electron.launch({
      executablePath: exePath,
    })
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('app starts and renders canvas', async () => {
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const canvasCount = await window.locator('canvas').count()
    console.log('[test] canvas count:', canvasCount)
    expect(canvasCount).toBeGreaterThan(0)
    await assertNoErrors()
  })

  test('loads GLB file and model renders', async () => {
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)

    // Load GLB file
    await window.locator('input[type="file"]').setInputFiles({
      name: 'test-box.glb',
      mimeType: 'model/gltf-binary',
      buffer: TEST_GLB,
    })

    await waitForLoadDone(window)
    await assertNoErrors()

    // Canvas still visible
    const canvasVisible = await window.locator('canvas').first().isVisible()
    expect(canvasVisible).toBe(true)
  })
})