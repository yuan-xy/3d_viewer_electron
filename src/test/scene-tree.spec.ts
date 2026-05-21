import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROBOT_GLB = readFileSync(path.join(__dirname, 'fixtures', 'RobotExpressive.glb'))

/** Wait for ModelGroup to finish loading (replaces fixed timeouts). */
async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe.serial('Multi-level scene tree', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--ozone-platform-hint=x11'],
      env: { ...process.env, E2E: '1' },
    })
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('scene tree panel title is visible', async () => {
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const title = window.locator('aside').first().locator('.text-xs.font-semibold')
    await expect(title).toBeVisible()
    const text = await title.textContent()
    // Title text varies by locale (Scene / 场景)
    expect(text?.length).toBeGreaterThan(0)
  })

  test('loads a hierarchical GLB and renders tree nodes with expand/collapse', async () => {
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    await window.locator('input[type="file"]').setInputFiles({
      name: 'RobotExpressive.glb',
      mimeType: 'model/gltf-binary',
      buffer: ROBOT_GLB,
    })

    await waitForLoadDone(window)

    const leftPanel = window.locator('aside').first()
    const treeNodes = leftPanel.locator('.whitespace-nowrap')

    // Use auto-retrying assertions instead of bare count() — locator.count()
    // does not wait, and on Windows the React DOM may not have committed yet.
    await expect.poll(async () => await treeNodes.count(), { timeout: 15000 }).toBeGreaterThan(1)
    const nodeCount = await treeNodes.count()

    const rootNode = treeNodes.first()
    await expect(rootNode).toBeVisible()

    // Chevron buttons exist for nodes with children
    const chevronButtons = leftPanel.locator('button[aria-label="collapse"], button[aria-label="expand"]')
    await expect.poll(async () => await chevronButtons.count(), { timeout: 10000 }).toBeGreaterThan(0)
    const chevronCount = await chevronButtons.count()

    console.log(`[test] tree nodes: ${nodeCount}, chevron buttons: ${chevronCount}`)
  })

  test('expand/collapse toggles children visibility', async () => {
    const window = await electronApp.firstWindow()
    const leftPanel = window.locator('aside').first()

    const initialCount = await leftPanel.locator('.whitespace-nowrap').count()

    const collapseBtn = leftPanel.locator('button[aria-label="collapse"]').first()
    const collapseCount = await collapseBtn.count()
    if (collapseCount > 0) {
      await collapseBtn.click()
      await window.waitForFunction(
        (initial: number) => {
          const panel = document.querySelector('aside')
          return (panel?.querySelectorAll('.whitespace-nowrap').length ?? 0) < initial
        },
        initialCount,
      )

      const afterCollapseCount = await leftPanel.locator('.whitespace-nowrap').count()
      expect(afterCollapseCount).toBeLessThan(initialCount)

      const expandBtn = leftPanel.locator('button[aria-label="expand"]').first()
      await expandBtn.click()
      await window.waitForFunction(
        (initial: number) => {
          const panel = document.querySelector('aside')
          return (panel?.querySelectorAll('.whitespace-nowrap').length ?? 0) === initial
        },
        initialCount,
      )

      const afterExpandCount = await leftPanel.locator('.whitespace-nowrap').count()
      expect(afterExpandCount).toBe(initialCount)

      console.log(`[test] initial=${initialCount}, collapsed=${afterCollapseCount}, expanded=${afterExpandCount}`)
    }
  })

  test('eye icon toggles visibility on hover', async () => {
    const window = await electronApp.firstWindow()
    const leftPanel = window.locator('aside').first()
    const firstNode = leftPanel.locator('.whitespace-nowrap').first()

    await firstNode.hover()

    const eyeButton = firstNode.locator('button[aria-label="hide"], button[aria-label="show"]')
    await expect(eyeButton).toBeVisible()
    const eyeCount = await eyeButton.count()
    expect(eyeCount).toBeGreaterThan(0)

    await eyeButton.click()
    await expect(firstNode).toHaveClass(/opacity-40/)

    console.log('[test] eye icon visibility toggle works')
  })
})
