import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const GLB_BUFFER = readFileSync(path.join(__dirname, '../../../ficad_web/src/test/cube_with_hole.glb'))

test.describe('Ficad Web Electron', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('app starts without errors and renders canvas', async ({ page }) => {
    const consoleErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`))

    await page.goto('/workspace', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    await expect(page.getByText('Ficad', { exact: true })).toBeVisible()
    await expect(page.locator('canvas').first()).toBeAttached()

    expect(consoleErrors).toEqual([])
  })

  test('loads GLB file and renders 3D mesh without errors', async ({ page }) => {
    const consoleErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`))

    await page.goto('/workspace', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // Upload GLB file
    await page.locator('input[type="file"]').setInputFiles({
      name: 'cube_with_hole.glb',
      mimeType: 'model/gltf-binary',
      buffer: GLB_BUFFER,
    })

    // Upload area should disappear after model loads
    await expect(page.getByText(/Supports STL/).first()).not.toBeVisible({ timeout: 10000 })

    // Canvas still rendered (WebGL still running)
    await expect(page.locator('canvas').first()).toBeAttached()

    // No errors
    expect(consoleErrors).toEqual([])
  })

  test('desktop layout renders all toolbar groups', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/workspace', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    await expect(page.locator('[role="group"]')).toHaveCount(5)
    await expect(page.locator('canvas').first()).toBeAttached()
  })

  test('loads GLB and toolbar groups remain visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/workspace', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    await expect(page.locator('[role="group"]')).toHaveCount(5)

    await page.locator('input[type="file"]').setInputFiles({
      name: 'cube_with_hole.glb',
      mimeType: 'model/gltf-binary',
      buffer: GLB_BUFFER,
    })

    await page.waitForTimeout(4000)

    // Toolbar still intact after model load
    await expect(page.locator('[role="group"]')).toHaveCount(5)
    await expect(page.locator('canvas').first()).toBeAttached()
  })
})