/**
 * @vitest-environment node
 *
 * Integration test: STEP → GLB conversion using the production pipeline.
 *
 * Tests buildGlbFromResult() — the same code path used by stepToGlb(),
 * stepToGlbCached(), and preCache in production. Validates GLB binary
 * structure, STEP_topology extension, face proxy data, and columnar
 * selector format.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..')

// ── OCCT bootstrap (Node.js equivalent of loadOcct's browser script/XHR) ──

interface OcctModule {
  ReadStepFile(buffer: Uint8Array, params: Record<string, unknown>): OcctImportResult
}

interface OcctImportResult {
  success: boolean
  root: { name: string; meshes: number[]; children: unknown[] }
  meshes: Array<{
    name: string
    attributes: { position: { array: Float32Array }; normal?: { array: Float32Array } }
    index: { array: Uint32Array }
    color?: [number, number, number]
    brep_faces?: Array<{ first: number; last: number }>
  }>
}

let occtModule: OcctModule
let glbBuffer: ArrayBuffer
let gltf: Record<string, unknown>

beforeAll(async () => {
  // Load the CJS UMD module — sets globalThis.occtimportjs
  const cjsPath = join(PROJECT_ROOT, 'src', 'renderer', 'public', 'wasm', 'occt-import-js.cjs')
  globalThis.occtimportjs = require(cjsPath) as (config: Record<string, unknown>) => Promise<OcctModule>

  // Load WASM binary directly from disk (bypass XHR)
  const wasmPath = join(PROJECT_ROOT, 'src', 'renderer', 'public', 'wasm', 'occt-import-js.wasm')
  const wasmBuffer = readFileSync(wasmPath)
  const wasmBinary = wasmBuffer.buffer.slice(
    wasmBuffer.byteOffset,
    wasmBuffer.byteOffset + wasmBuffer.byteLength,
  ) as ArrayBuffer

  occtModule = await (globalThis.occtimportjs as unknown as (config: Record<string, unknown>) => Promise<OcctModule>)({
    wasmBinary,
    locateFile: (_path: string) => '',
  })

  // Read STEP fixture
  const stepPath = join(PROJECT_ROOT, 'src', 'test', 'fixtures', 'keycap_v6.step')
  const stepBuf = readFileSync(stepPath)
  const stepData = new Uint8Array(
    stepBuf.buffer,
    stepBuf.byteOffset,
    stepBuf.byteLength,
  )

  // Step 1: OCCT import (same params as production)
  const params = {
    linearUnit: 'millimeter',
    linearDeflectionType: 'absolute_value',
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  }

  const result = occtModule.ReadStepFile(stepData, params)
  expect(result.success).toBe(true)

  // Step 2: build GLB via the PRODUCTION function (same as stepToGlb/stepToGlbCached/preCache)
  const { buildGlbFromResult } = await import('./stepToGlb')
  glbBuffer = buildGlbFromResult(result, { includeSelectorTopology: true, entryKind: 'part' })

  // Parse JSON chunk for validation
  const dv = new DataView(glbBuffer)
  const jsonLen = dv.getUint32(12, true)
  const jsonBytes = new Uint8Array(glbBuffer, 20, jsonLen)
  let end = jsonLen
  while (end > 0 && jsonBytes[end - 1] === 0x20) end--
  gltf = JSON.parse(new TextDecoder().decode(jsonBytes.slice(0, end)))
}, 120000)

// ── Helpers ──

function getBinOffset(): number {
  const dv = new DataView(glbBuffer)
  const jsonLen = dv.getUint32(12, true)
  let offset = 20 + jsonLen
  while (offset % 4 !== 0) offset++
  return offset + 8 // skip BIN chunk header
}

function readBufferView(viewIndex: number): Uint8Array {
  const views = gltf.bufferViews as Array<{ byteOffset: number; byteLength: number }>
  const view = views[viewIndex]
  const binOffset = getBinOffset()
  return new Uint8Array(glbBuffer, binOffset + view.byteOffset, view.byteLength)
}

// ── Tests ──

describe('STEP → GLB production pipeline', () => {
  // ── GLB binary structure ──

  it('has valid GLB header', () => {
    const dv = new DataView(glbBuffer)
    expect(dv.getUint32(0, true)).toBe(0x46546C67)  // magic
    expect(dv.getUint32(4, true)).toBe(2)            // version
    expect(dv.getUint32(8, true)).toBe(glbBuffer.byteLength) // total length
  })

  it('has valid JSON chunk type', () => {
    const dv = new DataView(glbBuffer)
    expect(dv.getUint32(16, true)).toBe(0x4E4F534A)
  })

  it('has valid BIN chunk type', () => {
    const dv = new DataView(glbBuffer)
    const jsonLen = dv.getUint32(12, true)
    let binHeader = 20 + jsonLen
    while (binHeader % 4 !== 0) binHeader++
    expect(dv.getUint32(binHeader + 4, true)).toBe(0x004E4942)
  })

  // ── glTF core ──

  it('has asset version 2.0', () => {
    expect((gltf.asset as Record<string, unknown>).version).toBe('2.0')
  })

  it('has nodes, meshes, accessors, and bufferViews', () => {
    expect((gltf.nodes as unknown[]).length).toBeGreaterThan(0)
    expect((gltf.meshes as unknown[]).length).toBeGreaterThan(0)
    expect((gltf.accessors as unknown[]).length).toBeGreaterThan(0)
    expect((gltf.bufferViews as unknown[]).length).toBeGreaterThan(0)
  })

  // ── STEP_topology extension ──

  it('includes STEP_topology in extensionsUsed', () => {
    expect(gltf.extensionsUsed).toContain('STEP_topology')
  })

  it('has STEP_topology extension with required fields', () => {
    const ext = (gltf.extensions as Record<string, unknown>)?.STEP_topology as Record<string, unknown> | undefined
    expect(ext).toBeDefined()
    expect(ext!.schemaVersion).toBe(1)
    expect(ext!.entryKind).toBe('part')
    expect(ext!.encoding).toBe('utf-8')
    expect(typeof ext!.indexView).toBe('number')
    expect(typeof ext!.selectorView).toBe('number')
  })

  // ── Index manifest ──

  it('has valid index manifest', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_topology as Record<string, unknown>
    const indexBytes = readBufferView(ext.indexView as number)
    const indexManifest = JSON.parse(new TextDecoder().decode(indexBytes))

    expect(indexManifest.schemaVersion).toBe(1)
    expect(indexManifest.entryKind).toBe('part')
    expect(Array.isArray(indexManifest.meshes)).toBe(true)
    expect(indexManifest.meshes.length).toBeGreaterThan(0)
    expect(indexManifest.meshes[0].faceCount).toBeGreaterThan(0)

    // Mesh metadata
    const firstMesh = indexManifest.meshes[0]
    expect(typeof firstMesh.index).toBe('number')
    expect(typeof firstMesh.name).toBe('string')
    expect(typeof firstMesh.vertexCount).toBe('number')
    expect(typeof firstMesh.triangleCount).toBe('number')
  })

  // ── Selector manifest ──

  it('has valid selector manifest', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_topology as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    expect(sel.schemaVersion).toBe(1)
    expect(sel.profile).toBe('selector')

    // Occurrences, faces
    expect(sel.occurrences.length).toBeGreaterThan(0)
    expect(sel.faces.length).toBeGreaterThan(0)
    expect(sel.edges).toBeDefined()

    // Columnar format
    expect(Array.isArray(sel.tables?.faceColumns)).toBe(true)
    expect(Array.isArray(sel.faces[0])).toBe(true)

    // BBox
    expect(Array.isArray(sel.bbox?.min)).toBe(true)
    expect(Array.isArray(sel.bbox?.max)).toBe(true)
    expect(sel.bbox.min.length).toBe(3)
    expect(sel.bbox.max.length).toBe(3)
  })

  // ── Face proxy runs ──

  it('has valid faceRuns buffer', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_topology as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    const runsView = sel.buffers?.views?.faceRuns
    expect(runsView).toBeDefined()
    expect(runsView.dtype).toBe('uint32')
    expect(runsView.count).toBe(sel.faces.length * 5)

    const runsBytes = readBufferView(runsView.bufferView)
    const faceRuns = new Uint32Array(
      runsBytes.buffer,
      runsBytes.byteOffset,
      runsView.count,
    )
    expect(faceRuns.length).toBe(sel.faces.length * 5)
    expect(faceRuns[0]).toBe(0) // first run occRow = 0
    expect(faceRuns[4]).toBe(0) // first run faceRow = 0
  })

  // ── Face ID patterns ──

  it('has valid face IDs matching occurrence IDs', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_topology as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    const firstFaceId: string = sel.faces[0][0]
    expect(firstFaceId).toMatch(/^o\d+\.f\d+$/)

    // All face occurrence IDs exist in occurrences
    const occIds = new Set(sel.occurrences.map((o: unknown[]) => o[0]))
    for (const face of sel.faces) {
      const faceOccId = face[1] as string
      expect(occIds.has(faceOccId), `face ${face[0]} occurrence ${faceOccId} not found`).toBe(true)
    }
  })

  // ── Node metadata ──

  it('has cadOccurrenceId on mesh nodes', () => {
    const nodes = gltf.nodes as Array<Record<string, unknown>>
    // Find first mesh node (node with mesh index)
    const meshNode = nodes.find(n => typeof n.mesh === 'number')
    expect(meshNode).toBeDefined()
    expect(meshNode!.extras).toBeDefined()
    expect((meshNode!.extras as Record<string, unknown>).cadOccurrenceId).toBeDefined()
  })

  // ── Face proxy structure ──

  it('has face proxy with runsView reference', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_topology as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    expect(sel.faceProxy?.runsView).toBe('faceRuns')
    expect(Array.isArray(sel.faceProxy?.runColumns)).toBe(true)
    expect(sel.faceProxy.runColumns).toContain('occurrenceRow')
    expect(sel.faceProxy.runColumns).toContain('faceRow')
    expect(sel.faceProxy.runColumns).toContain('triangleStart')
    expect(sel.faceProxy.runColumns).toContain('triangleCount')
  })
})
