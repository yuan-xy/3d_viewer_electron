/**
 * @vitest-environment node
 *
 * Integration test: STEP → GLB conversion using the production pipeline.
 *
 * Tests buildGlbFromResult() — the same code path used by stepToGlb(),
 * stepToGlbCached(), and preCache in production. Validates GLB binary
 * structure, STEP_T extension, face proxy data, and columnar
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

  // ── STEP_T extension ──

  it('includes STEP_T in extensionsUsed', () => {
    expect(gltf.extensionsUsed).toContain('STEP_T')
  })

  it('has STEP_T extension with required fields', () => {
    const ext = (gltf.extensions as Record<string, unknown>)?.STEP_T as Record<string, unknown> | undefined
    expect(ext).toBeDefined()
    expect(ext!.schemaVersion).toBe(2)
    expect(ext!.entryKind).toBe('part')
    expect(ext!.encoding).toBe('utf-8')
    expect(typeof ext!.selectorView).toBe('number')
  })

  // ── Selector manifest ──

  it('has valid selector manifest', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_T as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    expect(sel.schemaVersion).toBe(2)
    expect(sel.profile).toBe('selector')

    // Occurrences, faces
    expect(sel.occurrences.length).toBeGreaterThan(0)
    expect(sel.faces.length).toBeGreaterThan(0)
    expect(sel.edges).toBeDefined()

    // Columnar format
    expect(Array.isArray(sel.tables?.faceColumns)).toBe(true)
    expect(Array.isArray(sel.faces[0])).toBe(true)

    // BBox (flat array: [minX, minY, minZ, maxX, maxY, maxZ])
    expect(Array.isArray(sel.bbox)).toBe(true)
    expect(sel.bbox.length).toBe(6)
  })

  // ── Face proxy runs ──

  it('has valid faceRuns buffer', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_T as Record<string, unknown>
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
    const ext = (gltf.extensions as Record<string, unknown>).STEP_T as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    const firstFaceId: string = sel.faces[0][0]
    expect(firstFaceId).toMatch(/^\d+\.f\d+$/)

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
    const ext = (gltf.extensions as Record<string, unknown>).STEP_T as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    expect(sel.faceProxy?.runsView).toBe('faceRuns')
    expect(Array.isArray(sel.faceProxy?.runColumns)).toBe(true)
    expect(sel.faceProxy.runColumns).toContain('occurrenceRow')
    expect(sel.faceProxy.runColumns).toContain('faceRow')
    expect(sel.faceProxy.runColumns).toContain('triangleStart')
    expect(sel.faceProxy.runColumns).toContain('triangleCount')
  })

  it('has edge proxy with positionsView and indicesView', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_T as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    expect(sel.edgeProxy?.positionsView).toBe('edgePositions')
    expect(sel.edgeProxy?.indicesView).toBe('edgeIndices')
  })

  it('has edge proxy geometry buffers (empty — edges not available from WASM module)', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_T as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    const views = sel.buffers?.views as Record<string, { dtype: string; bufferView: number; count: number }> | undefined
    // Edge proxy buffers exist structurally but are empty because occt-import-js
    // (WASM module) only exposes brep_faces, not brep_edges. STEP topological
    // edges must come from OCCT's TopExp_Explorer / BRepAdaptor_Curve.
    expect(views?.edgePositions?.dtype).toBe('float32')
    expect(views?.edgeIndices?.dtype).toBe('uint32')
    expect(views?.edgePositions?.count).toBe(0)
    expect(views?.edgeIndices?.count).toBe(0)
    expect(views?.edgeIds?.count).toBe(0)
  })

  it('does not include face proxy geometry (selector profile has only runs)', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_T as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    const views = sel.buffers?.views as Record<string, unknown> | undefined
    expect(views?.facePositions).toBeUndefined()
    expect(views?.faceIndices).toBeUndefined()
    // faceProxy has no source field (unlike Python's artifact profile)
    expect(sel.faceProxy?.source).toBeUndefined()
  })
})
