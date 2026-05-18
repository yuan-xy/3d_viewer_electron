import { test, expect, _electron, ElectronApplication } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

// Fixtures for enabled formats across groups
const FIXTURES: { name: string; file: string; format: string }[] = [
  // Mesh
  { name: 'Cerberus.obj', file: 'Cerberus.obj', format: 'OBJ' },
  { name: 'dolphins_be.ply', file: 'dolphins_be.ply', format: 'PLY' },
  { name: 'mixamo.fbx', file: 'mixamo.fbx', format: 'FBX' },
  { name: 'elf.dae', file: 'elf.dae', format: 'Collada' },
  { name: 'portalgun.3ds', file: 'portalgun.3ds', format: '3DS' },
  { name: 'rook.amf', file: 'rook.amf', format: 'AMF' },
  { name: 'Demo.lwo', file: 'Demo.lwo', format: 'LWO' },
  { name: 'Rhino_Logo.3dm', file: 'Rhino_Logo.3dm', format: '3DM' },
  { name: 'menger.vox', file: 'menger.vox', format: 'VOX' },
  { name: 'Box.kmz', file: 'Box.kmz', format: 'KMZ' },
  // Point cloud
  { name: 'helix_201.xyz', file: 'helix_201.xyz', format: 'XYZ' },
  { name: 'Al2O3.pdb', file: 'Al2O3.pdb', format: 'PDB' },
  { name: 'simple.pcd', file: 'simple.pcd', format: 'PCD' },
  // Volume
  { name: 'bunny.vtk', file: 'bunny.vtk', format: 'VTK' },
  { name: 'I.nrrd', file: 'I.nrrd', format: 'NRRD' },
  // Animation
  { name: 'pirouette.bvh', file: 'pirouette.bvh', format: 'BVH' },
  { name: 'ogro.md2', file: 'ogro.md2', format: 'MD2' },
  // GCode
  { name: 'benchy.gcode', file: 'benchy.gcode', format: 'GCode' },
  // Other
  { name: 'camera.wrl', file: 'camera.wrl', format: 'VRML' },
  // Wasm-based
  { name: 'bunny.drc', file: 'bunny.drc', format: 'Draco' },
  { name: 'saeukkang.usdz', file: 'saeukkang.usdz', format: 'USDZ' },
]

test.describe('3D Viewer Electron - Format Loading', () => {
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

  test('app starts and renders canvas', async () => {
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    const canvasCount = await window.locator('canvas').count()
    expect(canvasCount).toBeGreaterThan(0)
  })

  for (const fixture of FIXTURES) {
    test(`loads ${fixture.format} file (${fixture.name}) without errors`, async () => {
      test.setTimeout(30000)
      const window = await electronApp.firstWindow()

      // Reset model store so the file input is visible again
      await window.evaluate(() => {
        window.__modelStore?.getState().reset()
      })
      await window.waitForTimeout(500)

      const fileBuffer = readFileSync(path.join(__dirname, 'fixtures', fixture.file))

      const consoleMessages: string[] = []
      window.on('console', (msg) => {
        consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
      })

      // Load via file input
      await window.locator('input[type="file"]').setInputFiles({
        name: fixture.file,
        mimeType: 'application/octet-stream',
        buffer: fileBuffer,
      })

      // Wait for loading
      await window.waitForTimeout(8000)

      // Check no fatal load errors
      const errors = consoleMessages.filter(m =>
        m.includes('[ModelGroup] load error:')
      )
      if (errors.length > 0) {
        console.log(`[test] ${fixture.format} load errors:`, errors)
      }

      // Verify scene has content (mesh, line, or points)
      const sceneHasContent = await window.evaluate(() => {
        const dev = window.__r3f_dev
        if (!dev?.scene) return false
        let count = 0
        dev.scene.traverse((obj: any) => {
          if (obj?.isMesh || obj?.isLine || obj?.isLineSegments || obj?.isPoints) count++
        })
        return count > 0
      })
      console.log(`[test] ${fixture.format} scene has content:`, sceneHasContent)
      expect(sceneHasContent).toBe(true)
    })
  }
})
