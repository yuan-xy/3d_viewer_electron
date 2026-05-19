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
import { loadFormat } from '@/engine/formatLoaders'
import { detectFormat, FORMAT_MAP, type FormatId } from '@/config/file-formats'

const FIXTURES_DIR = path.resolve('src/test/fixtures')

// Formats that require special runtime setup (WASM paths, external packages)
// and are either covered by Playwright E2E or not currently testable in Node.
const PLAYWRIGHT_ONLY: Set<FormatId> = new Set(['stl', 'glb', '3mf', 'step'])
const SKIP_FORMATS: Set<FormatId> = new Set([
  'mdd',   // disabled: morph data only, no standalone render
  'ifc',   // disabled: needs web-ifc-three npm package
  'ldraw', // disabled: needs setPartsLibraryPath
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
  /** For glTF: pre-resolved buffer with embedded data URIs (Node resolves deps) */
  resolvedBuffer?: ArrayBuffer
}

/**
 * Pre-process a glTF fixture: parse JSON, find external buffer/image URIs,
 * read the referenced files from disk, and embed them as data URIs.
 */
function resolveGltfFixture(gltfPath: string): ArrayBuffer {
  const gltfText = fs.readFileSync(gltfPath, 'utf-8')
  const gltf = JSON.parse(gltfText)
  const baseDir = path.dirname(gltfPath)

  if (gltf.buffers) {
    for (const buffer of gltf.buffers) {
      if (buffer.uri && !buffer.uri.startsWith('data:')) {
        const resolvedPath = path.resolve(baseDir, buffer.uri)
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`glTF fixture references missing file: "${buffer.uri}" at ${resolvedPath}`)
        }
        const data = fs.readFileSync(resolvedPath).toString('base64')
        buffer.uri = `data:application/octet-stream;base64,${data}`
      }
    }
  }

  if (gltf.images) {
    for (const image of gltf.images) {
      if (image.uri && !image.uri.startsWith('data:')) {
        const resolvedPath = path.resolve(baseDir, image.uri)
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`glTF fixture references missing texture: "${image.uri}" at ${resolvedPath}`)
        }
        const data = fs.readFileSync(resolvedPath).toString('base64')
        const ext = image.uri.split('.').pop()?.toLowerCase()
        const mime =
          ext === 'png' ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'webp' ? 'image/webp'
          : 'application/octet-stream'
        image.uri = `data:${mime};base64,${data}`
      }
    }
  }

  return new TextEncoder().encode(JSON.stringify(gltf)).buffer as ArrayBuffer
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
    }

    // For glTF, pre-resolve external dependencies so loadFormat can handle it
    if (format === 'gltf') {
      entry.resolvedBuffer = resolveGltfFixture(path.join(FIXTURES_DIR, file))
    }

    fixtures.push(entry)
  }

  return fixtures
}

const fixtures = findFixtures()

describe('Format loaders (Vitest integration)', () => {
  fixtures.forEach(({ file, format, label, resolvedBuffer }) => {
    it(`loadFormat ${label} (${file})`, async () => {
      const filePath = path.join(FIXTURES_DIR, file)
      const raw = fs.readFileSync(filePath)
      const buffer = raw.buffer.slice(
        raw.byteOffset,
        raw.byteOffset + raw.byteLength,
      ) as ArrayBuffer

      const result = await loadFormat(resolvedBuffer ?? buffer, format)

      const totalObjects = result.meshes.length + result.objects.length
      expect(totalObjects, `${label} should produce at least 1 mesh/object`).toBeGreaterThan(0)
    })
  })

  it('at least some format fixtures were found', () => {
    expect(fixtures.length).toBeGreaterThan(0)
    console.log(`[format test] Testing ${fixtures.length} formats: ${fixtures.map(f => f.format).join(', ')}`)
  })

  it('loadFormat gltf resolves external buffer and produces meshes', async () => {
    const gltfPath = path.join(FIXTURES_DIR, 'AnimatedMorphSphere.gltf')
    const resolvedBuffer = resolveGltfFixture(gltfPath)
    const result = await loadFormat(resolvedBuffer, 'gltf')
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
})
