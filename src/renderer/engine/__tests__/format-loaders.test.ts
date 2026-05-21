/**
 * Format loader integration tests — Vitest (no Electron needed).
 *
 * Tests each format loader by calling loadFormat() directly with fixture files.
 * Validates that parse succeeds and returns valid meshes/objects.
 *
 * The 4 key formats (STL/GLB/3MF/STEP) are only tested in Playwright E2E.
 * This file covers all remaining enabled non-disabled formats.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as THREE from 'three'
import { loadFormat } from '@/engine/formatLoaders'
import { detectFormat, FORMAT_MAP, type FormatId } from '@/config/file-formats'

const FIXTURES_DIR = path.resolve('src/test/fixtures')

// Formats that require special runtime setup (WASM paths, external packages)
// and are either covered by Playwright E2E or not currently testable in Node.
const PLAYWRIGHT_ONLY: Set<FormatId> = new Set(['stl', 'glb', '3mf', 'step'])
const SKIP_FORMATS: Set<FormatId> = new Set([
  'mdd',   // disabled: morph data only, no standalone render
  'ifc',   // disabled: needs web-ifc-three npm package
  'drc',   // needs DRACOLoader WASM decoder path
  '3dm',   // needs Rhino3dmLoader WASM library path
  'kmz',   // fixture appears corrupted (fflate: invalid zip data)
  'wrl',   // fixture has VRML lexing errors
  'usdz',  // needs complex texture/image loading in USDComposer
])

interface FixtureEntry {
  file: string
  format: FormatId
  label: string
  /** For glTF: pre-built GLB buffer (Node resolves deps). When set, `format` is
   *  overridden to 'glb' since the buffer is already a GLB binary. */
  resolvedBuffer?: ArrayBuffer
  /** The format to pass to loadFormat (may differ from detected format if resolvedBuffer is used) */
  loadFormat?: FormatId
}

/**
 * Pre-process a glTF fixture: parse JSON, read external buffer files from disk,
 * and build a self-contained GLB binary. Mirrors the gltfToGlb path used in
 * the Electron app.
 *
 * Returns a GLB ArrayBuffer that can be passed to loadFormat(..., 'glb').
 */
function resolveGltfFixture(gltfPath: string): ArrayBuffer {
  const gltfText = fs.readFileSync(gltfPath, 'utf-8')
  const gltf = JSON.parse(gltfText)
  const baseDir = path.dirname(gltfPath)

  // Read external buffers into binary chunk
  const bufferDatas: Uint8Array[] = []
  let totalLen = 0

  if (gltf.buffers) {
    for (const buf of gltf.buffers) {
      if (buf.uri && !buf.uri.startsWith('data:')) {
        const resolved = path.resolve(baseDir, buf.uri)
        if (!fs.existsSync(resolved)) {
          throw new Error(`glTF fixture references missing file: "${buf.uri}" at ${resolved}`)
        }
        const data = new Uint8Array(fs.readFileSync(resolved).buffer)
        bufferDatas.push(data)
        totalLen += data.byteLength
        delete buf.uri
      }
    }
  }

  // Concatenate binaries
  const bin = new Uint8Array(totalLen)
  let off = 0
  for (const d of bufferDatas) {
    bin.set(d, off)
    off += d.byteLength
  }

  // Build GLB binary
  const encoder = new TextEncoder()
  const jsonBytes = encoder.encode(JSON.stringify(gltf))
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const binPad = (4 - (bin.length % 4)) % 4
  const jsonChunkLen = jsonBytes.length + jsonPad
  const binChunkLen = bin.length + binPad
  const total = 12 + 8 + jsonChunkLen + (bin.length > 0 ? 8 + binChunkLen : 0)

  const buffer = new ArrayBuffer(total)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let pos = 0

  view.setUint32(pos, 0x46546C67, true); pos += 4
  view.setUint32(pos, 2, true); pos += 4
  view.setUint32(pos, total, true); pos += 4

  view.setUint32(pos, jsonChunkLen, true); pos += 4
  view.setUint32(pos, 0x4E4F534A, true); pos += 4
  bytes.set(jsonBytes, pos)
  for (let i = jsonBytes.length; i < jsonChunkLen; i++) bytes[pos + i] = 0x20
  pos += jsonChunkLen

  if (bin.length > 0) {
    view.setUint32(pos, binChunkLen, true); pos += 4
    view.setUint32(pos, 0x004E4942, true); pos += 4
    bytes.set(bin, pos)
  }

  return buffer
}

function findFixtures(): FixtureEntry[] {
  const allFiles = fs.readdirSync(FIXTURES_DIR)

  const fixtures: FixtureEntry[] = []
  const seen = new Set<FormatId>()

  for (const file of allFiles) {
    const format = detectFormat(file)
    if (!format) continue
    if (PLAYWRIGHT_ONLY.has(format)) continue
    if (SKIP_FORMATS.has(format)) continue
    if (seen.has(format)) continue
    seen.add(format)

    const fmtEntry = FORMAT_MAP[format]
    const entry: FixtureEntry = {
      file,
      format,
      label: fmtEntry?.label ?? format,
      loadFormat: format,
    }

    // For glTF, pre-build GLB binary so loadFormat can handle it directly
    if (format === 'gltf') {
      entry.resolvedBuffer = resolveGltfFixture(path.join(FIXTURES_DIR, file))
      entry.loadFormat = 'glb' // buffer is already a self-contained GLB
    }

    fixtures.push(entry)
  }

  return fixtures
}

const fixtures = findFixtures()

describe('Format loaders (Vitest integration)', () => {
  fixtures.forEach(({ file, format, label, resolvedBuffer, loadFormat: useFormat }) => {
    it(`loadFormat ${label} (${file})`, async () => {
      const filePath = path.join(FIXTURES_DIR, file)
      const raw = fs.readFileSync(filePath)
      const buffer = raw.buffer.slice(
        raw.byteOffset,
        raw.byteOffset + raw.byteLength,
      ) as ArrayBuffer

      const result = await loadFormat(resolvedBuffer ?? buffer, useFormat ?? format)

      const totalObjects = result.meshes.length + result.objects.length
      expect(totalObjects, `${label} should produce at least 1 mesh/object`).toBeGreaterThan(0)
    })
  })

  it('at least some format fixtures were found', () => {
    expect(fixtures.length).toBeGreaterThan(0)
    console.log(`[format test] Testing ${fixtures.length} formats: ${fixtures.map(f => f.format).join(', ')}`)
  })

  it('loadFormat gltf (pre-built GLB from fixture) produces meshes', async () => {
    const gltfPath = path.join(FIXTURES_DIR, 'AnimatedMorphSphere.gltf')
    const glbBuffer = resolveGltfFixture(gltfPath)
    const result = await loadFormat(glbBuffer, 'glb')
    expect(result.meshes.length).toBeGreaterThan(0)
    expect(result.meshes[0].type).toBe('Mesh')
  })

  it('glTF fixture references existing .bin file', () => {
    const gltfPath = path.join(FIXTURES_DIR, 'AnimatedMorphSphere.gltf')
    const gltfText = fs.readFileSync(gltfPath, 'utf-8')
    const gltf = JSON.parse(gltfText)
    expect(gltf.buffers).toBeDefined()
    expect(gltf.buffers[0].uri).toBe('AnimatedMorphSphere.bin')
    const binPath = path.resolve(path.dirname(gltfPath), gltf.buffers[0].uri)
    expect(fs.existsSync(binPath)).toBe(true)
  })

  // ---- glTF Electron-flow simulation: loadFormat resolves external deps via mock IPC ----
  describe('glTF Electron flow (resolveGltfDependencies)', () => {
    it('loads AnimatedMorphSphere.gltf by resolving .bin via mock electronAPI', async () => {
      const gltfPath = path.join(FIXTURES_DIR, 'AnimatedMorphSphere.gltf')
      const raw = fs.readFileSync(gltfPath)
      const rawBuffer = raw.buffer.slice(
        raw.byteOffset,
        raw.byteOffset + raw.byteLength,
      ) as ArrayBuffer

      // Simulate Electron's webUtils.getPathForFile by providing the real fs path
      const testFilePath = path.resolve(gltfPath)

      // Mock window.electronAPI.readFileAsBase64 to read files from disk
      // (mimics the main process fs:readFileAsBase64 IPC handler)
      const originalApi = window.electronAPI
      window.electronAPI = {
        ...originalApi,
        readFileAsBase64: async (filePath: string) => {
          try {
            const buf = fs.readFileSync(filePath)
            return { success: true, data: buf.toString('base64') }
          } catch (e) {
            return { success: false, error: (e as Error).message }
          }
        },
        getFilePath: (() => testFilePath) as any,
        getAppVersion: async () => '1.0.0',
        getPlatform: () => 'win32',
        openExternal: async () => {},
        readDirectory: async () => ({ success: true, files: [] }),
        openFileDialog: async () => ({ success: true, filePaths: [] }),
        toggleFullscreen: async () => true,
        onFullscreenChanged: (() => () => {}) as any,
      } as any

      try {
        // This is the exact code path taken in Electron:
        // loadFormat(raw .gltf buffer, 'gltf', absoluteFilePath)
        // → resolveGltfDependencies is called internally and uses the mock API
        const result = await loadFormat(rawBuffer, 'gltf', testFilePath)

        expect(result.meshes.length, 'should produce at least 1 mesh').toBeGreaterThan(0)
        expect(result.meshes[0].type).toBe('Mesh')
        expect(result.sceneRoot).toBeDefined()
      } finally {
        window.electronAPI = originalApi
      }
    })

    it('throws when referenced .bin file is missing', async () => {
      const gltfPath = path.join(FIXTURES_DIR, 'AnimatedMorphSphere.gltf')
      const raw = fs.readFileSync(gltfPath)
      const rawBuffer = raw.buffer.slice(
        raw.byteOffset,
        raw.byteOffset + raw.byteLength,
      ) as ArrayBuffer

      // Point to a non-existent directory so .bin resolution fails
      const fakePath = path.resolve(FIXTURES_DIR, 'nonexistent', 'AnimatedMorphSphere.gltf')

      const originalApi = window.electronAPI
      window.electronAPI = {
        ...originalApi,
        readFileAsBase64: async (_filePath: string) => {
          return { success: false, error: 'ENOENT: file not found' }
        },
        getAppVersion: async () => '1.0.0',
        getPlatform: () => 'win32',
        openExternal: async () => {},
        readDirectory: async () => ({ success: true, files: [] }),
        openFileDialog: async () => ({ success: true, filePaths: [] }),
        toggleFullscreen: async () => true,
        onFullscreenChanged: (() => () => {}) as any,
      } as any

      try {
        await loadFormat(rawBuffer, 'gltf', fakePath)
        // Should have thrown
        expect.fail('Expected loadFormat to throw for missing referenced file')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        expect(message).toContain('Cannot find referenced file')
        expect(message).toContain('AnimatedMorphSphere.bin')
      } finally {
        window.electronAPI = originalApi
      }
    })

    it('throws when electronAPI is unavailable and glTF has external refs', async () => {
      const gltfPath = path.join(FIXTURES_DIR, 'AnimatedMorphSphere.gltf')
      const raw = fs.readFileSync(gltfPath)
      const rawBuffer = raw.buffer.slice(
        raw.byteOffset,
        raw.byteOffset + raw.byteLength,
      ) as ArrayBuffer

      const originalApi = window.electronAPI
      delete (window as any).electronAPI

      try {
        await loadFormat(rawBuffer, 'gltf', '/fake/path/model.gltf')
        expect.fail('Expected loadFormat to throw without electronAPI')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        expect(message).toContain('desktop app')
      } finally {
        window.electronAPI = originalApi
      }
    })
  })

  // ---- Morph target handling: geometry clone → new Mesh ----
  describe('morph target mesh processing', () => {
    // Regression: GLTFLoader creates meshes whose geometry has morphAttributes.
    // R3F creates a fresh THREE.Mesh() (no geometry in constructor), then assigns
    // geometry as a plain property — which does NOT call updateMorphTargets().
    // morphTargetInfluences stays undefined while geometry.morphAttributes is
    // non-empty, and Three.js crashes in WebGLMorphtargets.update every frame.
    //
    // The fix: cloneMeshGeometry preserves morphAttributes, and initMorphTargets()
    // initializes morphTargetInfluences to an array of zeros matching the morph count.

    it('cloneMeshGeometry preserves morph attributes', async () => {
      const { cloneMeshGeometry } = await import('@/engine/components/cloneMeshGeometry')

      const gltfPath = path.join(FIXTURES_DIR, 'AnimatedMorphSphere.gltf')
      const glbBuffer = resolveGltfFixture(gltfPath)
      const result = await loadFormat(glbBuffer, 'glb')
      expect(result.meshes.length).toBeGreaterThan(0)

      for (const src of result.meshes) {
        const cloned = cloneMeshGeometry(src)

        // Morph attributes are preserved — the caller is responsible for
        // calling initMorphTargets() on the resulting mesh.
        const morphKeys = cloned.morphAttributes
          ? Object.keys(cloned.morphAttributes)
          : []
        // If source had morph targets, cloned should have them too
        const srcMorphKeys = src.geometry.morphAttributes
          ? Object.keys(src.geometry.morphAttributes)
          : []
        expect(morphKeys.length).toBe(srcMorphKeys.length)
      }
    })

    it('initMorphTargets prevents crash on R3F-style geometry assignment', async () => {
      const { cloneMeshGeometry, initMorphTargets } = await import('@/engine/components/cloneMeshGeometry')

      const gltfPath = path.join(FIXTURES_DIR, 'AnimatedMorphSphere.gltf')
      const glbBuffer = resolveGltfFixture(gltfPath)
      const result = await loadFormat(glbBuffer, 'glb')
      expect(result.meshes.length).toBeGreaterThan(0)

      for (const src of result.meshes) {
        const cloned = cloneMeshGeometry(src)
        const morphKeys = cloned.morphAttributes
          ? Object.keys(cloned.morphAttributes)
          : []

        if (morphKeys.length === 0) continue // skip if no morph data

        // Simulate R3F-style geometry assignment
        const r3fMesh = new THREE.Mesh()
        r3fMesh.geometry = cloned
        // Without initMorphTargets, morphTargetInfluences is undefined
        expect(r3fMesh.morphTargetInfluences).toBeUndefined()

        // initMorphTargets fixes it
        initMorphTargets(r3fMesh)
        expect(r3fMesh.morphTargetInfluences).toBeDefined()
        expect(r3fMesh.morphTargetInfluences!.length).toBeGreaterThan(0)
        // All influences should be initialized to 0
        for (const v of r3fMesh.morphTargetInfluences!) {
          expect(v).toBe(0)
        }
      }
    })

    it('initMorphTargets is a no-op for geometry without morph attributes', async () => {
      const { initMorphTargets } = await import('@/engine/components/cloneMeshGeometry')
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
      // Should not throw
      expect(() => initMorphTargets(mesh)).not.toThrow()
      // morphTargetInfluences stays undefined (no morph data to init)
      expect(mesh.morphTargetInfluences).toBeUndefined()
    })

    it('raw geometry clone without fix causes undefined morphTargetInfluences', () => {
      // This test documents WHY initMorphTargets is needed.
      // Create a geometry with morph attributes (simulating GLTFLoader output)
      const geo = new THREE.BufferGeometry()
      const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.morphAttributes = {
        position: [
          new THREE.BufferAttribute(new Float32Array([0, 0, 0.1, 1, 0, 0.1, 0, 1, 0.1]), 3),
        ],
      }
      expect(Object.keys(geo.morphAttributes).length).toBeGreaterThan(0)

      // R3F creates a Mesh without geometry in constructor, then assigns
      // geometry as a plain property.  updateMorphTargets() is NOT called.
      const r3fMesh = new THREE.Mesh()
      r3fMesh.geometry = geo
      expect(r3fMesh.morphTargetInfluences).toBeUndefined()
      // ^ This is the bug: non-empty morphAttributes + undefined
      //   morphTargetInfluences → Three.js crashes during rendering.
    })
  })
})
