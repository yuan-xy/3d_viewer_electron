/**
 * E2E format loading tests — Playwright + Electron.
 * Only tests the 4 key formats that need full rendering pipeline:
 * STL, GLB, 3MF, STEP.
 *
 * All other 17+ formats are tested via Vitest in
 * src/renderer/engine/__tests__/format-loaders.test.ts
 */
import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

const KEY_FIXTURES: { name: string; file: string; format: string }[] = [
  { name: 'test-box.glb', file: 'test-box.glb', format: 'GLB' },
  { name: 'vise.3mf', file: 'vise.3mf', format: '3MF' },
  { name: 'test-model.step', file: 'test-model.step', format: 'STEP' },
]

/** Collect page errors and return an assertion helper that fails on any error. */
function trackErrors(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  return {
    /** Assert no global errors since the last check */
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

test.describe('3D Viewer - Key Format E2E', () => {
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
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    expect(await window.locator('canvas').count()).toBeGreaterThan(0)
    await assertNoErrors()
  })

  test('loads GLB file and renders mesh', async () => {
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    const fixture = KEY_FIXTURES[0]
    const fileBuffer = readFileSync(path.join(__dirname, 'fixtures', fixture.file))

    await window.locator('input[type="file"]').setInputFiles({
      name: fixture.file,
      mimeType: 'model/gltf-binary',
      buffer: fileBuffer,
    })

    await waitForLoadDone(window)
    await assertNoErrors()

    const sceneHasContent = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let count = 0
      dev.scene.traverse((obj: any) => {
        if (obj?.isMesh) count++
      })
      return count > 0
    })
    expect(sceneHasContent).toBe(true)

    // GLB has topology with edges → selection toolbar should be visible
    await expect(window.locator('button[title="Object"], button[title="物体"]')).toBeAttached()
    await expect(window.locator('button[title="Edge"], button[title="边"]')).toBeAttached()
    await expect(window.locator('button[title="Point"], button[title="点"]')).toBeAttached()
  })

  test('loads 3MF file and renders mesh', async () => {
    test.setTimeout(30000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    const fixture = KEY_FIXTURES[1]
    const fileBuffer = readFileSync(path.join(__dirname, 'fixtures', fixture.file))

    await window.evaluate(() => {
      window.__modelStore?.getState().reset()
    })

    await window.locator('input[type="file"]').setInputFiles({
      name: fixture.file,
      mimeType: 'application/octet-stream',
      buffer: fileBuffer,
    })

    await waitForLoadDone(window)
    await assertNoErrors()

    const sceneHasContent = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let count = 0
      dev.scene.traverse((obj: any) => {
        if (obj?.isMesh) count++
      })
      return count > 0
    })
    expect(sceneHasContent).toBe(true)

    // 3MF has no topology → selection toolbar should be hidden entirely
    await expect(window.locator('button[title="Object"], button[title="物体"]')).not.toBeAttached()
  })

  test('loads STEP file and converts to GLB', async () => {
    test.setTimeout(60000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    const fixture = KEY_FIXTURES[2]
    const fileBuffer = readFileSync(path.join(__dirname, 'fixtures', fixture.file))

    await window.evaluate(() => {
      window.__modelStore?.getState().reset()
    })

    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    await window.locator('input[type="file"]').setInputFiles({
      name: fixture.file,
      mimeType: 'application/octet-stream',
      buffer: fileBuffer,
    })

    await waitForLoadDone(window, 50000)
    await assertNoErrors()

    const topologyBuilt = consoleMessages.some((m) =>
      m.includes('[ModelGroup] faceIds built:'),
    )
    console.log(`[test] STEP topology built: ${topologyBuilt}`)
    expect(topologyBuilt).toBe(true)

    const sceneHasContent = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let count = 0
      dev.scene.traverse((obj: any) => {
        if (obj?.isMesh) count++
      })
      return count > 0
    })
    expect(sceneHasContent).toBe(true)
  })

  test('loads GLB with edge topology and validates selection/display modes', async () => {
    test.setTimeout(30000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)

    await window.evaluate(() => {
      window.__modelStore?.getState().reset()
    })

    const fileBuffer = readFileSync(path.join(FIXTURES_DIR, 'test-box.glb'))
    await window.locator('input[type="file"]').setInputFiles({
      name: 'test-box.glb',
      mimeType: 'model/gltf-binary',
      buffer: fileBuffer,
    })

    await waitForLoadDone(window)
    await assertNoErrors()

    // Wait for selectorRuntime with edges > 0 (R3F onCreated + effect may lag)
    await window.waitForFunction(() => {
      const dev = window.__r3f_dev
      return dev?.selectorRuntime?.edges.length > 0
    })

    // Edge and Point buttons should be visible
    await expect(window.locator('button[title="Edge"], button[title="边"]')).toBeAttached()
    await expect(window.locator('button[title="Point"], button[title="点"]')).toBeAttached()

    // Wireframe, Solid+Wireframe, and Debug options should be available in dropdown
    const displaySelect = window.locator('select')
    await expect(displaySelect.locator('option[value="wireframe"]')).toBeAttached()
    await expect(displaySelect.locator('option[value="solidWithWireframe"]')).toBeAttached()
    await expect(displaySelect.locator('option[value="debug"]')).toBeAttached()
  })

  test('loads STEP model (no edges) and validates edge-dependent UI hidden', async () => {
    test.setTimeout(60000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)

    await window.evaluate(() => {
      window.__modelStore?.getState().reset()
    })

    const fileBuffer = readFileSync(path.join(FIXTURES_DIR, 'test-model.step'))
    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    await window.locator('input[type="file"]').setInputFiles({
      name: 'test-model.step',
      mimeType: 'application/octet-stream',
      buffer: fileBuffer,
    })

    await waitForLoadDone(window, 50000)
    await assertNoErrors()

    // Verify edges === 0
    const info = await window.evaluate(() => {
      const rt = window.__r3f_dev?.selectorRuntime
      if (!rt) return null
      return { edges: rt.edges.length, faces: rt.faces?.length }
    })
    expect(info).not.toBeNull()
    expect(info!.edges).toBe(0)

    // Edge and Point buttons should be hidden (no edges)
    await expect(window.locator('button[title="Edge"], button[title="边"]')).not.toBeAttached()
    await expect(window.locator('button[title="Point"], button[title="点"]')).not.toBeAttached()

    // Wireframe, Solid+Wireframe, and Debug options should NOT be present in dropdown
    await expect(window.locator('select').locator('option[value="wireframe"]')).not.toBeAttached()
    await expect(window.locator('select').locator('option[value="solidWithWireframe"]')).not.toBeAttached()
    await expect(window.locator('select').locator('option[value="debug"]')).not.toBeAttached()

    // Face button should be visible (topology exists)
    await expect(window.locator('button[title="Face"], button[title="面"]')).toBeAttached()
  })

  // Regression: glTF files with morph targets (like AnimatedMorphSphere)
  // must not trigger "Cannot read properties of undefined (reading 'length')"
  // in Three.js WebGLMorphtargets.update during rendering.
  test('loads glTF with morph targets and renders without errors', async () => {
    test.setTimeout(30000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)

    await window.evaluate(() => {
      window.__modelStore?.getState().reset()
    })

    // Load glTF fixture via IPC (needs real filesystem path for external .bin)
    const gltfPath = path.join(FIXTURES_DIR, 'AnimatedMorphSphere.gltf')
    await window.evaluate(async (fp: string) => {
      const api = window.electronAPI
      const result = await api.readFileAsBase64(fp)
      if (!result.success || !result.data) throw new Error(`Failed to read fixture: ${result.error}`)
      const binary = atob(result.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      window.__modelStore.getState().setModelBuffer(buf, 'gltf')
      window.__modelStore.getState().setModelFilePath(fp)
      window.__modelStore.getState().setGLBUrl('AnimatedMorphSphere.gltf')
    }, gltfPath)

    await waitForLoadDone(window)
    await assertNoErrors()

    // Verify meshes are in the scene
    const meshCount = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return 0
      let count = 0
      dev.scene.traverse((obj: any) => { if (obj?.isMesh) count++ })
      return count
    })
    console.log(`[test] glTF morph target mesh count: ${meshCount}`)
    expect(meshCount).toBeGreaterThan(0)
  })
})
