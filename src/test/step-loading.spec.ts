import { test, expect, _electron, ElectronApplication } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const TEST_STEP = readFileSync(path.join(__dirname, 'fixtures', 'test-model.step'))

test.describe('Ficad Web Electron - STEP Loading', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    const exePath = path.join(PROJECT_ROOT, 'dist', 'win-unpacked', 'Ficad Web.exe')
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
    await window.waitForTimeout(3000)

    const canvasCount = await window.locator('canvas').count()
    console.log('[test] canvas count:', canvasCount)
    expect(canvasCount).toBeGreaterThan(0)
  })

  test('loads STEP file, converts to GLB, renders mesh with topology', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForTimeout(2000)

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

    // Wait for STEP → GLB conversion (WASM load + OCCT processing + GLB build + React render)
    await window.waitForTimeout(15000)

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
    const window = await electronApp.firstWindow()
    await window.waitForTimeout(2000)

    // Populate file list panel with fixture files
    const hasFiles = await window.evaluate(async (fixturesPath: string) => {
      const result = await window.electronAPI.readDirectory(fixturesPath)
      if (!result.success || !result.files) return false
      window.__modelStore.getState().setFolderFiles(fixturesPath, result.files)
      return true
    }, path.resolve(__dirname, 'fixtures'))
    expect(hasFiles).toBe(true)

    await window.waitForTimeout(1000)

    // Collect console messages
    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    // Find and click the test-model.step entry in the file list
    const stepEntry = window.locator('div[data-index]').filter({ hasText: 'test-model.step' })
    const entryCount = await stepEntry.count()
    console.log('[test] step file entries found:', entryCount)
    expect(entryCount).toBe(1)

    await stepEntry.click()

    // Wait for STEP → GLB conversion and render
    await window.waitForTimeout(15000)

    const relevant = consoleMessages.filter(m =>
      m.includes('[ModelGroup]') ||
      m.includes('STEP') ||
      m.includes('Load failed') ||
      m.includes('Error') ||
      m.includes('error')
    )
    console.log('[test] console messages (file-list click):', relevant)

    // Verify faceIds built (proof of successful conversion)
    const hasFaceIds = consoleMessages.some(m => m.includes('[ModelGroup] faceIds built:'))
    expect(hasFaceIds).toBe(true)

    // Verify 3D meshes rendered
    const sceneHasMeshes = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let meshCount = 0
      dev.scene.traverse((obj: any) => {
        if (obj?.isMesh) meshCount++
      })
      return meshCount > 0
    })
    console.log('[test] scene has meshes (file-list click):', sceneHasMeshes)
    expect(sceneHasMeshes).toBe(true)

    // Verify topology
    const topologyInfo = await window.evaluate(() => {
      const rt = window.__r3f_dev?.selectorRuntime
      if (!rt) return null
      return {
        faces: rt.faces?.length,
        occurrences: rt.occurrenceIdByRowIndex?.size,
      }
    })
    console.log('[test] topology (file-list click):', topologyInfo)
    expect(topologyInfo).not.toBeNull()
    expect(topologyInfo!.faces).toBeGreaterThan(0)
  })

  test('caches converted GLB on first load, hits cache on second load', async () => {
    test.setTimeout(90000)
    const window = await electronApp.firstWindow()
    await window.waitForTimeout(2000)

    // Reset model and populate file list with fixture files
    await window.evaluate(async (fixturesPath: string) => {
      window.__modelStore.getState().reset()
      const result = await window.electronAPI.readDirectory(fixturesPath)
      if (result.success && result.files) {
        window.__modelStore.getState().setFolderFiles(fixturesPath, result.files)
      }
    }, path.resolve(__dirname, 'fixtures'))
    await window.waitForTimeout(1000)

    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    // Click keycap_v6.step (not loaded by prior tests) → must be cache miss
    const entry1 = window.locator('div[data-index]').filter({ hasText: 'keycap_v6.step' })
    await entry1.click()
    await window.waitForTimeout(15000)

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
    const entry2 = window.locator('div[data-index]').filter({ hasText: 'test-model.step' })
    await entry2.click()
    await window.waitForTimeout(15000)

    consoleMessages.length = 0
    const entry3 = window.locator('div[data-index]').filter({ hasText: 'keycap_v6.step' })
    await entry3.click()
    await window.waitForTimeout(8000)

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
  })

  test('shows loading overlay during STEP conversion and hides after', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForTimeout(2000)

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
  })
})
