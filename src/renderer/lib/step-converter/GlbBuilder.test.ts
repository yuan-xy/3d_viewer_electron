import { describe, it, expect } from 'vitest'
import { GlbBuilder } from './GlbBuilder'

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
  dv.getUint32(16, true) // jsonType — verified elsewhere; only need length
  const jsonBytes = new Uint8Array(buf, 20, jsonLen)
  // strip padding spaces
  let end = jsonLen
  while (end > 0 && jsonBytes[end - 1] === 0x20) end--
  const json = JSON.parse(new TextDecoder().decode(jsonBytes.slice(0, end)))

  let binOffset = 20 + jsonLen
  while (binOffset % 4 !== 0) binOffset++
  const binLen = dv.getUint32(binOffset, true)
  const binType = dv.getUint32(binOffset + 4, true)
  const binDataOffset = binOffset + 8

  return { json, binLen, binType, binDataOffset, totalLen: buf.byteLength }
}

describe('GlbBuilder', () => {
  it('writes a valid empty GLB', () => {
    const builder = new GlbBuilder()
    const buf = builder.write()

    const header = readGlbHeader(buf)
    expect(header.magic).toBe(0x46546C67)
    expect(header.version).toBe(2)
    expect(header.totalLength).toBe(buf.byteLength)
  })

  it('writes valid GLB with one mesh', () => {
    const builder = new GlbBuilder()

    // Single triangle: vertices (0,0,0), (1,0,0), (0,1,0) with normals (0,0,1)
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
    const indices = new Uint32Array([0, 1, 2])
    const matIdx = builder.addMaterial([1, 0, 0, 1])

    const meshIdx = builder.addMesh(positions, normals, [[indices, matIdx]], [0, 0, 0], [1, 1, 0], 'test-mesh')
    expect(meshIdx).toBe(0)

    const nodeIdx = builder.addNode({ name: 'test-node', mesh: meshIdx })
    builder.setSceneNodes([nodeIdx])

    const buf = builder.write()
    const chunks = readGlbChunks(buf)

    // GLB structure
    expect(chunks.json).toBeDefined()
    expect(chunks.json.asset.version).toBe('2.0')
    expect(chunks.json.meshes.length).toBe(1)
    expect(chunks.json.meshes[0].name).toBe('test-mesh')
    expect(chunks.json.meshes[0].primitives.length).toBe(1)
    expect(chunks.json.nodes.length).toBe(1)
    expect(chunks.json.scenes[0].nodes).toEqual([0])
    expect(chunks.binType).toBe(0x004E4942)
    expect(chunks.binLen).toBeGreaterThan(0)
    expect(chunks.totalLen).toBe(buf.byteLength)
  })

  it('returns null for empty mesh (no vertices)', () => {
    const builder = new GlbBuilder()
    const empty = new Float32Array(0)
    expect(builder.addMesh(empty, empty, [], [0, 0, 0], [0, 0, 0], 'empty')).toBeNull()
  })

  it('addBufferView aligns to 4 bytes', () => {
    const builder = new GlbBuilder()
    // Add a 1-byte payload, then a 4-byte payload — second should be 4-byte aligned
    builder.addBufferView(new Uint8Array([1]))
    builder.addBufferView(new Uint32Array([42]))
    const views = builder.json.bufferViews as Array<{ byteOffset: number }>
    expect(views[1].byteOffset % 4).toBe(0)
  })

  it('addAccessor creates correct accessor', () => {
    const builder = new GlbBuilder()
    const data = new Float32Array([1, 2, 3, 4, 5, 6]) // 2 vec3
    const accIdx = builder.addAccessor(data, 5126, 'VEC3', 34962, 2)
    const accessors = builder.json.accessors as Array<Record<string, unknown>>
    expect(accessors[accIdx].componentType).toBe(5126)
    expect(accessors[accIdx].type).toBe('VEC3')
    expect(accessors[accIdx].count).toBe(2)
  })

  it('addMaterial creates PBR material', () => {
    const builder = new GlbBuilder()
    const idx = builder.addMaterial([0.5, 0.25, 0.75, 1.0])
    const materials = builder.json.materials as Array<Record<string, unknown>>
    expect(idx).toBe(0)
    expect(materials[0].doubleSided).toBe(true)
    const pbr = materials[0].pbrMetallicRoughness as Record<string, unknown>
    expect(pbr.metallicFactor).toBe(0)
    expect(pbr.roughnessFactor).toBe(0.55)
  })

  it('can build multiple meshes', () => {
    const builder = new GlbBuilder()
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const nrm = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
    const idx = new Uint32Array([0, 1, 2])
    const mat = builder.addMaterial([1, 0, 0, 1])

    builder.addMesh(pos, nrm, [[idx, mat]], [0, 0, 0], [1, 1, 0], 'mesh-1')
    builder.addMesh(pos, nrm, [[idx, mat]], [0, 0, 0], [1, 1, 0], 'mesh-2')

    const buf = builder.write()
    const chunks = readGlbChunks(buf)
    expect(chunks.json.meshes.length).toBe(2)
    expect(chunks.json.bufferViews.length).toBeGreaterThan(0)
    expect(chunks.json.accessors.length).toBeGreaterThan(0)
  })

  it('mesh without normals omits NORMAL attribute', () => {
    const builder = new GlbBuilder()
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const emptyNormals = new Float32Array(0)
    const idx = new Uint32Array([0, 1, 2])
    const mat = builder.addMaterial([1, 1, 1, 1])

    builder.addMesh(pos, emptyNormals, [[idx, mat]], [0, 0, 0], [1, 1, 0], 'no-norm')
    const buf = builder.write()
    const chunks = readGlbChunks(buf)
    const prim = chunks.json.meshes[0].primitives[0]
    expect(prim.attributes.NORMAL).toBeUndefined()
    expect(prim.attributes.POSITION).toBeDefined()
  })

  it('setSceneNodes populates scene correctly', () => {
    const builder = new GlbBuilder()
    builder.addNode({ name: 'n1', mesh: null })
    builder.addNode({ name: 'n2', mesh: null })
    builder.setSceneNodes([0, 1])

    const buf = builder.write()
    const chunks = readGlbChunks(buf)
    expect(chunks.json.scenes[0].nodes).toEqual([0, 1])
  })
})
