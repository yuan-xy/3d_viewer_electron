/**
 * Mouse interaction regression tests — Playwright + Electron.
 *
 * Tests that mouse operations on the 3D canvas do not cause crashes.
 * Full OrbitControls camera manipulation verification requires WebGL-aware
 * input simulation that Playwright's mouse API cannot fully replicate.
 * These tests ensure the interaction pipeline is wired correctly and
 * doesn't regress into unhandled errors.
 */
import { test, expect, _electron, ElectronApplication } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const TEST_GLB = readFileSync(path.join(__dirname, 'fixtures', 'test-box.glb'))

test.describe('Model Interaction Regression', () => {
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

  test('canvas receives mouse events without errors', async () => {
    test.setTimeout(30000)
    const window = await electronApp.firstWindow()

    const errors: string[] = []
    window.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // Load test model
    await window.evaluate(() => {
      window.__modelStore?.getState().reset()
    })
    await window.waitForTimeout(500)

    await window.locator('input[type="file"]').setInputFiles({
      name: 'test-box.glb',
      mimeType: 'model/gltf-binary',
      buffer: TEST_GLB,
    })
    await window.waitForTimeout(3000)

    const canvas = window.locator('canvas').first()
    await canvas.waitFor({ state: 'attached', timeout: 20000 })
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return

    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // Click on canvas
    await window.mouse.click(cx, cy)
    await window.waitForTimeout(300)

    // Double-click
    await window.mouse.click(cx, cy)
    await window.waitForTimeout(100)
    await window.mouse.click(cx, cy)
    await window.waitForTimeout(300)

    // Scroll wheel
    await window.mouse.wheel(0, 200)
    await window.waitForTimeout(300)
    await window.mouse.wheel(0, -200)
    await window.waitForTimeout(300)

    // Left drag
    await window.mouse.move(cx, cy)
    await window.mouse.down({ button: 'left' })
    await window.mouse.move(cx + 100, cy + 50, { steps: 10 })
    await window.mouse.up({ button: 'left' })
    await window.waitForTimeout(300)

    // Right drag
    await window.mouse.move(cx, cy)
    await window.mouse.down({ button: 'right' })
    await window.mouse.move(cx + 80, cy - 40, { steps: 5 })
    await window.mouse.up({ button: 'right' })
    await window.waitForTimeout(300)

    const criticalErrors = errors.filter((e) =>
      !e.includes('favicon') && !e.includes('net::') && !e.includes('file://'),
    )
    console.log('[test] errors after interactions:', criticalErrors.length)
    expect(criticalErrors.length).toBe(0)

    // Canvas still visible after all interactions
    expect(await canvas.isVisible()).toBe(true)
  })

  test('canvas renders after rapid interactions', async () => {
    test.setTimeout(30000)
    const window = await electronApp.firstWindow()

    const canvas = window.locator('canvas').first()
    const box = await canvas.boundingBox()
    if (!box) return

    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // Rapid sequence of events
    for (let i = 0; i < 5; i++) {
      await window.mouse.click(cx + i * 10, cy + i * 5)
      await window.waitForTimeout(50)
      await window.mouse.wheel(0, 50)
      await window.waitForTimeout(50)
    }

    await window.waitForTimeout(500)

    // Canvas still attached and visible
    await canvas.waitFor({ state: 'attached', timeout: 5000 })
    expect(await window.locator('canvas').count()).toBeGreaterThan(0)
  })

  test('model stays loaded after viewport interactions', async () => {
    test.setTimeout(30000)
    const window = await electronApp.firstWindow()

    // Verify model is loaded (scene has meshes)
    const hasContent = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let count = 0
      dev.scene.traverse((obj: unknown) => {
        if ((obj as Record<string, unknown>)?.isMesh) count++
      })
      return count > 0
    })
    expect(hasContent).toBe(true)

    const canvas = window.locator('canvas').first()
    const box = await canvas.boundingBox()
    if (!box) return

    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // Perform a variety of interactions
    await window.mouse.move(cx, cy)
    await window.mouse.wheel(0, 300)
    await window.waitForTimeout(200)
    await window.mouse.wheel(0, -300)
    await window.waitForTimeout(200)

    // Model should still be in scene after interactions
    const stillHasContent = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let count = 0
      dev.scene.traverse((obj: unknown) => {
        if ((obj as Record<string, unknown>)?.isMesh) count++
      })
      return count > 0
    })
    expect(stillHasContent).toBe(true)
  })
})
