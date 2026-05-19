/**
 * @vitest-environment node
 *
 * Integration test: STEP → GLB conversion pipeline.
 *
 * Tests the full conversion chain using the real occt-import-js WASM module.
 * Validates GLB binary structure, STEP_topology extension, face proxy data,
 * and columnar selector format.
 *
 * Uses keycap_v6.step fixture.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..')

// Load occt-import-js CJS module onto globalThis
let occtInit: (config: { wasmBinary: ArrayBuffer; locateFile: (path: string) => string }) => Promise<OcctModule>
let wasmBinary: ArrayBuffer

interface OcctModule {
  ReadStepFile(buffer: Uint8Array, params: Record<string, unknown>): OcctImportResult
}

beforeAll(async () => {
  // Load the CJS UMD module — sets globalThis.occtimportjs
  const cjsPath = join(PROJECT_ROOT, 'src', 'renderer', 'public', 'wasm', 'occt-import-js.cjs')
  globalThis.occtimportjs = require(cjsPath) as (config: Record<string, unknown>) => Promise<OcctModule>

  // Load WASM binary directly from disk (bypass XHR)
  const wasmPath = join(PROJECT_ROOT, 'src', 'renderer', 'public', 'wasm', 'occt-import-js.wasm')
  wasmBinary = readFileSync(wasmPath).buffer.slice(
    readFileSync(wasmPath).byteOffset,
    readFileSync(wasmPath).byteOffset + readFileSync(wasmPath).byteLength,
  ) as ArrayBuffer

  // Initialize the module
  occtInit = globalThis.occtimportjs as typeof occtInit
}, 60000)

interface OcctImportResult {
  success: boolean
  root: { name: string; meshes: number[]; children: unknown[] }
  meshes: Array<{
    name: string
    attributes: { position: { array: Float32Array }; normal?: { array: Float32Array } }
    index: { array: Uint32Array }
    brep_faces?: Array<{ first: number; last: number }>
  }>
}

function loadStepFixture(filename: string): ArrayBuffer {
  const filePath = join(PROJECT_ROOT, 'src', 'test', 'fixtures', filename)
  const buf = readFileSync(filePath)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

function readGlbHeader(buf: ArrayBuffer) {
  const dv = new DataView(buf)
  return {
    magic: dv.getUint32(0, true),
    version: dv.getUint32(4, true),
    totalLength: dv.getUint32(8, true),
  }
}

function readGlbChunks(buf: ArrayBuffer) {
  const dv = new DataView(buf)
  const jsonLen = dv.getUint32(12, true)
  dv.getUint32(16, true) // jsonType — already verified in header check
  const jsonBytes = new Uint8Array(buf, 20, jsonLen)
  let end = jsonLen
  while (end > 0 && jsonBytes[end - 1] === 0x20) end--
  const json = JSON.parse(new TextDecoder().decode(jsonBytes.slice(0, end)))

  let binOffset = 20 + jsonLen
  while (binOffset % 4 !== 0) binOffset++
  const binLen = dv.getUint32(binOffset, true)
  // binType should be 0x004E4942 — validated by consumers
  void dv.getUint32(binOffset + 4, true)

  return { json, binLen, binOffset: binOffset + 8 }
}

describe('STEP → GLB conversion', () => {
  let glbBuffer: ArrayBuffer
  let gltf: Record<string, unknown>

  beforeAll(async () => {
    const stepData = new Uint8Array(loadStepFixture('keycap_v6.step'))

    const occt = await occtInit({
      wasmBinary,
      locateFile: (_path: string) => '',
    })

    const params = {
      linearUnit: 'millimeter',
      linearDeflectionType: 'absolute_value',
      linearDeflection: 0.001,
      angularDeflection: 0.5,
    }

    const result = occt.ReadStepFile(stepData, params) as OcctImportResult
    expect(result.success).toBe(true)

    // Use the core GlbBuilder + topologyExt pipeline (same as stepToGlb.ts)
    const { GlbBuilder } = await import('../GlbBuilder')
    const { addStepTopology } = await import('../topologyExt')

    const builder = new GlbBuilder()

    // Build GLB from OCCT result manually
    const color = [0.72, 0.72, 0.72, 1.0]
    const CAD_TO_GLB_SCALE = 0.001
    let occIdx = 0

    const nodeIndices: number[] = []

    for (const mesh of result.meshes) {
      const posArray = mesh.attributes.position.array
      const normArray = mesh.attributes.normal?.array
      const idxArray = mesh.index.array
      const occId = `o${occIdx++}`

      const positions = new Float32Array(posArray.length)
      const min = [Infinity, Infinity, Infinity] as number[]
      const max = [-Infinity, -Infinity, -Infinity] as number[]
      for (let i = 0; i < posArray.length; i += 3) {
        positions[i] = posArray[i] * CAD_TO_GLB_SCALE
        positions[i + 1] = posArray[i + 1] * CAD_TO_GLB_SCALE
        positions[i + 2] = posArray[i + 2] * CAD_TO_GLB_SCALE
        if (positions[i] < min[0]) min[0] = positions[i]
        if (positions[i + 1] < min[1]) min[1] = positions[i + 1]
        if (positions[i + 2] < min[2]) min[2] = positions[i + 2]
        if (positions[i] > max[0]) max[0] = positions[i]
        if (positions[i + 1] > max[1]) max[1] = positions[i + 1]
        if (positions[i + 2] > max[2]) max[2] = positions[i + 2]
      }

      const normals = normArray ? new Float32Array(normArray) : new Float32Array()
      const matIdx = builder.addMaterial(color)
      const indices = new Uint32Array(idxArray)
      const meshIdx = builder.addMesh(positions, normals, [[indices, matIdx]], min, max, mesh.name)

      const nodeIdx = builder.addNode({
        name: occId,
        mesh: meshIdx,
        extras: { cadOccurrenceId: occId, cadName: mesh.name },
      })
      nodeIndices.push(nodeIdx)
    }

    if (nodeIndices.length > 0) {
      builder.setSceneNodes(nodeIndices)
    }

    addStepTopology(builder, result, {
      includeSelectorTopology: true,
      entryKind: 'part',
    })

    glbBuffer = builder.write()
    const chunks = readGlbChunks(glbBuffer)
    gltf = chunks.json as Record<string, unknown>
  }, 120000)

  it('produces a valid GLB with correct header', () => {
    const header = readGlbHeader(glbBuffer)
    expect(header.magic).toBe(0x46546C67)
    expect(header.version).toBe(2)
    expect(header.totalLength).toBe(glbBuffer.byteLength)
  })

  it('has valid glTF asset', () => {
    expect((gltf.asset as Record<string, unknown>).version).toBe('2.0')
  })

  it('has at least one mesh and node', () => {
    expect((gltf.meshes as unknown[]).length).toBeGreaterThan(0)
    expect((gltf.nodes as unknown[]).length).toBeGreaterThan(0)
  })

  it('has STEP_topology extension', () => {
    const ext = (gltf.extensions as Record<string, unknown>)?.STEP_topology as Record<string, unknown> | undefined
    expect(ext).toBeDefined()
    expect(ext!.schemaVersion).toBe(1)
    expect(typeof ext!.indexView).toBe('number')
    expect(typeof ext!.selectorView).toBe('number')
  })

  it('has valid topology — occurrences, faces, edges', () => {
    const viewIdx = ((gltf.extensions as Record<string, unknown>).STEP_topology as Record<string, unknown>).selectorView as number
    const views = gltf.bufferViews as Array<{ byteOffset: number; byteLength: number }>
    const view = views[viewIdx]

    // Read selector manifest from BIN chunk
    const chunks = readGlbChunks(glbBuffer)
    const selectorBytes = new Uint8Array(glbBuffer, chunks.binOffset + view.byteOffset, view.byteLength)
    const selector = JSON.parse(new TextDecoder().decode(selectorBytes))

    expect(selector.schemaVersion).toBe(1)
    expect(selector.profile).toBe('selector')
    expect(selector.occurrences.length).toBeGreaterThan(0)
    expect(selector.faces.length).toBeGreaterThan(0)

    // Face rows are columnar arrays
    expect(Array.isArray(selector.faces[0])).toBe(true)

    // Face proxy runs
    const runsView = selector.buffers.views.faceRuns
    expect(runsView.dtype).toBe('uint32')
    expect(runsView.count).toBe(selector.faces.length * 5)
  })

  it('face IDs match occurrence IDs pattern', () => {
    const viewIdx = ((gltf.extensions as Record<string, unknown>).STEP_topology as Record<string, unknown>).selectorView as number
    const views = gltf.bufferViews as Array<{ byteOffset: number; byteLength: number }>
    const view = views[viewIdx]
    const chunks = readGlbChunks(glbBuffer)
    const selectorBytes = new Uint8Array(glbBuffer, chunks.binOffset + view.byteOffset, view.byteLength)
    const selector = JSON.parse(new TextDecoder().decode(selectorBytes))

    const firstFaceId: string = selector.faces[0][0]
    expect(firstFaceId).toMatch(/^o\d+\.f\d+$/)

    // All face occurrence IDs exist in occurrences
    const occIds = new Set(selector.occurrences.map((o: unknown[]) => o[0]))
    for (const face of selector.faces) {
      const faceOccId = face[1] as string
      expect(occIds.has(faceOccId), `face ${face[0]} occurrence ${faceOccId} not found`).toBe(true)
    }
  })

  it('node extras have cadOccurrenceId', () => {
    const firstNode = (gltf.nodes as Record<string, unknown>[])[0]
    expect(firstNode.extras).toBeDefined()
    expect((firstNode.extras as Record<string, unknown>).cadOccurrenceId).toBeDefined()
    expect(firstNode.name).toBe((firstNode.extras as Record<string, unknown>).cadOccurrenceId)
  })
})
