import { test, expect, ElectronApplication, _electron } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const ROBOT_GLB = readFileSync(path.join(__dirname, 'fixtures', 'RobotExpressive.glb'))

test.describe.serial('Multi-level scene tree', () => {
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

    await window.waitForTimeout(8000)

    const leftPanel = window.locator('aside').first()
    const treeNodes = leftPanel.locator('.whitespace-nowrap')
    const nodeCount = await treeNodes.count()

    expect(nodeCount).toBeGreaterThan(1)

    const rootNode = treeNodes.first()
    await expect(rootNode).toBeVisible()

    // Chevron buttons exist for nodes with children
    const chevronButtons = leftPanel.locator('button[aria-label="collapse"], button[aria-label="expand"]')
    const chevronCount = await chevronButtons.count()
    expect(chevronCount).toBeGreaterThan(0)

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
      await window.waitForTimeout(500)

      const afterCollapseCount = await leftPanel.locator('.whitespace-nowrap').count()
      expect(afterCollapseCount).toBeLessThan(initialCount)

      const expandBtn = leftPanel.locator('button[aria-label="expand"]').first()
      await expandBtn.click()
      await window.waitForTimeout(500)

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
    await window.waitForTimeout(300)

    const eyeButton = firstNode.locator('button[aria-label="hide"], button[aria-label="show"]')
    const eyeCount = await eyeButton.count()
    expect(eyeCount).toBeGreaterThan(0)
    await expect(eyeButton).toBeVisible()

    await eyeButton.click()
    await window.waitForTimeout(300)

    const classAttr = await firstNode.getAttribute('class')
    expect(classAttr).toContain('opacity-40')

    console.log('[test] eye icon visibility toggle works')
  })
})
