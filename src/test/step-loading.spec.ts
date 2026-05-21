import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_STEP = readFileSync(path.join(__dirname, 'fixtures', 'test-model.step'))

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

test.describe('3D Viewer Electron - STEP Loading', () => {
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

    const canvasCount = await window.locator('canvas').count()
    console.log('[test] canvas count:', canvasCount)
    expect(canvasCount).toBeGreaterThan(0)
    await assertNoErrors()
  })

  test('loads STEP file, converts to GLB, renders mesh with topology', async () => {
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)

    // Capture console messages for debugging
    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    // Load STEP file via file input
    await window.locator('input[type="file"]').setInputFiles({
      name: 'test-model.step',
      mimeType: 'application/octet-stream',
      buffer: TEST_STEP,
    })

    await waitForLoadDone(window, 60000)
    await assertNoErrors()

    // Diagnostic: dump relevant console messages
    const relevant = consoleMessages.filter(m =>
      m.includes('[ModelGroup]') ||
      m.includes('STEP') ||
      m.includes('occt') ||
      m.includes('wasm') ||
      m.includes('Error') ||
      m.includes('error')
    )
    console.log('[test] console messages (relevant):', relevant)

    // Verify STEP→GLB conversion succeeded (faceIds built = topology mapped)
    const hasFaceIds = consoleMessages.some(m => m.includes('[ModelGroup] faceIds built:'))
    expect(hasFaceIds).toBe(true)

    // Verify 3D meshes exist in the THREE.js scene
    const sceneHasMeshes = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let meshCount = 0
      dev.scene.traverse((obj: any) => {
        if (obj?.isMesh) meshCount++
      })
      return meshCount > 0
    })
    console.log('[test] scene has meshes:', sceneHasMeshes)
    expect(sceneHasMeshes).toBe(true)

    // Verify selectorRuntime (topology extension parsed correctly)
    const topologyInfo = await window.evaluate(() => {
      const rt = window.__r3f_dev?.selectorRuntime
      if (!rt) return null
      return {
        faces: rt.faces?.length,
        occurrences: rt.occurrenceIdByRowIndex?.size,
        edges: rt.edges?.length,
      }
    })
    console.log('[test] topology info:', topologyInfo)
    expect(topologyInfo).not.toBeNull()
    expect(topologyInfo!.faces).toBeGreaterThan(0)
  })

  test('clicks STEP file in file list panel and renders model', async () => {
    test.setTimeout(60000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')

    // Start each test with a clean cache so stale IndexedDB entries
    // from previous runs don't affect the conversion result.
    await window.evaluate(() => window.__clearStepCache())
    await window.evaluate(() => window.__modelStore?.getState().reset())

    // Populate file list panel with fixture files
    const hasFiles = await window.evaluate(async (fixturesPath: string) => {
      const result = await window.electronAPI.readDirectory(fixturesPath)
      if (!result.success || !result.files) return false
      window.__modelStore.getState().setFolderFiles(fixturesPath, result.files)
      return true
    }, path.resolve(__dirname, 'fixtures'))
    expect(hasFiles).toBe(true)

    // Wait for the file list entry to appear in the DOM
    const stepEntry = window.locator('div[data-index]').filter({ hasText: /test-model\.step$/ })
    await expect(stepEntry).toBeAttached()

    // Collect console messages
    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    await stepEntry.click()

    await waitForLoadDone(window, 50000)

    // After loadingPhase becomes 'done', ModelGroup's glbMeshes state update
    // and the subsequent React re-render (which logs faceIds built and attaches
    // meshes to the scene) may not have completed yet. Wait for actual meshes
    // in the THREE.js scene to ensure all render-cycle side effects are done.
    await window.waitForFunction(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let meshCount = 0
      dev.scene.traverse((obj: any) => { if (obj?.isMesh) meshCount++ })
      return meshCount > 0
    })

    // Verify faceIds built (proof of successful conversion)
    const hasFaceIds = consoleMessages.some(m => m.includes('[ModelGroup] faceIds built:'))
    expect(hasFaceIds).toBe(true)

    // Verify topology
    const topologyInfo = await window.evaluate(() => {
      const rt = window.__r3f_dev?.selectorRuntime
      if (!rt) return null
      return {
        faces: rt.faces?.length,
        occurrences: rt.occurrenceIdByRowIndex?.size,
      }
    })
    expect(topologyInfo).not.toBeNull()
    expect(topologyInfo!.faces).toBeGreaterThan(0)
    await assertNoErrors()
  })

  test('caches converted GLB on first load, hits cache on second load', async () => {
    test.setTimeout(90000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')

    // Reset model and populate file list with fixture files
    await window.evaluate(async (fixturesPath: string) => {
      window.__modelStore.getState().reset()
      const result = await window.electronAPI.readDirectory(fixturesPath)
      if (result.success && result.files) {
        window.__modelStore.getState().setFolderFiles(fixturesPath, result.files)
      }
    }, path.resolve(__dirname, 'fixtures'))

    // Wait for the file list entry to render before clicking
    const entry1 = window.locator('div[data-index]').filter({ hasText: /keycap_v6\.step$/ })
    await expect(entry1).toBeAttached()

    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    await entry1.click()
    await waitForLoadDone(window, 60000)

    const hasCacheMiss = consoleMessages.some(m => m.includes('[stepToGlbCached] miss'))
    const hasIndexedDbHit = consoleMessages.some(m => m.includes('[stepToGlbCached] IndexedDB hit'))
    const hadCache = hasCacheMiss || hasIndexedDbHit
    console.log('[test] first load (keycap_v6) cache miss:', hasCacheMiss, 'idb hit:', hasIndexedDbHit)
    expect(hadCache).toBe(true)

    // Verify model rendered
    let sceneOk = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let meshCount = 0
      dev.scene.traverse((obj: any) => { if (obj?.isMesh) meshCount++ })
      return meshCount > 0
    })
    expect(sceneOk).toBe(true)

    // Switch to test-model.step, then back to keycap_v6 → second load should hit memory cache
    consoleMessages.length = 0
    const entry2 = window.locator('div[data-index]').filter({ hasText: /test-model\.step$/ })
    await entry2.click()
    await waitForLoadDone(window, 60000)

    consoleMessages.length = 0
    const entry3 = window.locator('div[data-index]').filter({ hasText: /keycap_v6\.step$/ })
    await entry3.click()
    await waitForLoadDone(window)

    const cacheLogs = consoleMessages.filter(m => m.includes('[stepToGlbCached]'))
    console.log('[test] cache logs on re-click keycap_v6:', cacheLogs)

    const hasCacheHit = consoleMessages.some(m => m.includes('[stepToGlbCached] memory hit'))
    console.log('[test] second load cache hit:', hasCacheHit)
    expect(hasCacheHit).toBe(true)

    // Verify model renders from cache
    sceneOk = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let meshCount = 0
      dev.scene.traverse((obj: any) => { if (obj?.isMesh) meshCount++ })
      return meshCount > 0
    })
    expect(sceneOk).toBe(true)
    await assertNoErrors()
  })

  test('shows loading overlay during STEP conversion and hides after', async () => {
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')

    // Overlay is conditionally rendered — not in DOM when isConverting=false
    const overlay = window.locator('[data-testid="step-loading-overlay"]')
    await expect(overlay).not.toBeAttached()

    // Toggle on via store → React re-renders → overlay appears (main thread free, no WASM blocking)
    await window.evaluate(() => window.__modelStore.getState().setIsConverting(true))
    await expect(overlay).toBeAttached()
    await expect(overlay).toBeVisible()
    console.log('[test] overlay visible after setIsConverting(true)')

    // Toggle off → React unmounts overlay
    await window.evaluate(() => window.__modelStore.getState().setIsConverting(false))
    await expect(overlay).not.toBeAttached()
    console.log('[test] overlay unmounted after setIsConverting(false)')
    await assertNoErrors()
  })
})
