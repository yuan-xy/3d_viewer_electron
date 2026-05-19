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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
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

test.describe('3D Viewer - Key Format E2E', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    const exePath = path.join(PROJECT_ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe')
    electronApp = await _electron.launch({
      executablePath: exePath,
      args: ['--no-sandbox'],
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
    expect(await window.locator('canvas').count()).toBeGreaterThan(0)
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

    await window.waitForTimeout(3000)
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
    await window.waitForTimeout(500)

    await window.locator('input[type="file"]').setInputFiles({
      name: fixture.file,
      mimeType: 'application/octet-stream',
      buffer: fileBuffer,
    })

    await window.waitForTimeout(8000)
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
    await window.waitForTimeout(500)

    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    await window.locator('input[type="file"]').setInputFiles({
      name: fixture.file,
      mimeType: 'application/octet-stream',
      buffer: fileBuffer,
    })

    // STEP conversion needs WASM load + OCCT processing + GLB build + React render
    await window.waitForTimeout(25000)
    await assertNoErrors()

    // Verify topology was built (the ModelGroup console log)
    const topologyBuilt = consoleMessages.some((m) =>
      m.includes('[ModelGroup] faceIds built:'),
    )
    console.log(`[test] STEP topology built: ${topologyBuilt}`)
    expect(topologyBuilt).toBe(true)

    // Verify scene has meshes
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
    await window.waitForTimeout(500)

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

    // Wait for glTF → GLB conversion + React render
    await window.waitForTimeout(5000)
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
