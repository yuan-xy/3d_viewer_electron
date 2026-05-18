import { test, expect, ElectronApplication, _electron } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

test.describe('DesktopLayout panel widths', () => {
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

  test('panels use 15:70:15 percentage widths when both open', async () => {
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // Check that left and right toggle buttons exist (both panels should be open by default)
    const leftCloseBtn = window.locator('button').filter({ has: window.locator('.lucide-panel-left-close') })
    const rightCloseBtn = window.locator('button').filter({ has: window.locator('.lucide-panel-right-close') })

    // If both close buttons are visible, both panels are open
    const leftOpen = await leftCloseBtn.isVisible().catch(() => false)
    const rightOpen = await rightCloseBtn.isVisible().catch(() => false)

    if (!leftOpen || !rightOpen) {
      // Open both panels by clicking the open buttons
      if (!leftOpen) {
        const leftOpenBtn = window.locator('button').filter({ has: window.locator('.lucide-panel-left-open') })
        const count = await leftOpenBtn.count()
        if (count > 0) await leftOpenBtn.first().click()
        await window.waitForTimeout(500)
      }
      if (!rightOpen) {
        const rightOpenBtn = window.locator('button').filter({ has: window.locator('.lucide-panel-right-open') })
        const count = await rightOpenBtn.count()
        if (count > 0) await rightOpenBtn.first().click()
        await window.waitForTimeout(500)
      }
    }

    // Now measure the three sections
    const viewportWidth = window.viewportSize()?.width ?? 1280

    // The main content area has three children: left aside, center div, right aside
    const mainContent = window.locator('header + div.flex-1')
    const children = mainContent.locator('> *')
    const childCount = await children.count()

    console.log(`[test] viewport width: ${viewportWidth}, main content children: ${childCount}`)

    // Expect at least the center div + potentially one or both asides
    expect(childCount).toBeGreaterThanOrEqual(1)

    // Get bounding boxes of each child
    const boxes: { width: number; x: number }[] = []
    for (let i = 0; i < childCount; i++) {
      const box = await children.nth(i).boundingBox()
      if (box) {
        boxes.push({ width: box.width, x: box.x })
        console.log(`[test] child ${i}: width=${box.width.toFixed(1)}px, x=${box.x.toFixed(1)}px`)
      }
    }

    // With both panels open, we expect 3 children: left, center, right
    if (childCount === 3) {
      const mainBox = await mainContent.boundingBox()
      if (mainBox) {
        const totalWidth = mainBox.width
        const leftPct = (boxes[0].width / totalWidth) * 100
        const centerPct = (boxes[1].width / totalWidth) * 100
        const rightPct = (boxes[2].width / totalWidth) * 100

        console.log(`[test] percentages: left=${leftPct.toFixed(1)}%, center=${centerPct.toFixed(1)}%, right=${rightPct.toFixed(1)}%`)

        // Each panel should be roughly 15% (±3% tolerance for borders)
        expect(leftPct).toBeCloseTo(15, 0)
        expect(centerPct).toBeCloseTo(70, 0)
        expect(rightPct).toBeCloseTo(15, 0)

        // Verify canvas fills the center area
        const canvas = window.locator('canvas').first()
        const canvasBox = await canvas.boundingBox()
        if (canvasBox) {
          console.log(`[test] canvas: width=${canvasBox.width.toFixed(1)}px, x=${canvasBox.x.toFixed(1)}px`)
          // Canvas should be within the center column
          expect(canvasBox.x).toBeGreaterThanOrEqual(boxes[1].x)
          // Canvas width should be close to center column width
          expect(canvasBox.width).toBeCloseTo(boxes[1].width, -1) // within ~10px
        }
      }
    } else if (childCount === 2) {
      // Only one panel open: center + one aside
      const mainBox = await mainContent.boundingBox()
      if (mainBox) {
        const totalWidth = mainBox.width

        // Determine which panel is open (left has smaller x)
        const panelBox = boxes.find(b => Math.abs(b.width / totalWidth * 100 - 15) < 5)
        const centerBox = boxes.find(b => Math.abs(b.width / totalWidth * 100 - 15) >= 5)

        if (panelBox) {
          const panelPct = (panelBox.width / totalWidth) * 100
          console.log(`[test] panel percentage: ${panelPct.toFixed(1)}%`)
          expect(panelPct).toBeCloseTo(15, 0)
        }
        if (centerBox) {
          const centerPct = (centerBox.width / totalWidth) * 100
          console.log(`[test] center percentage: ${centerPct.toFixed(1)}%`)
          expect(centerPct).toBeCloseTo(85, 0)
        }
      }
    }
  })
})
