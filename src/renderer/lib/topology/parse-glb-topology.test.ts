import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { extractSelectorBundle, parseGlbContainer } from './parse-glb-topology'
import { buildSelectorRuntime } from './build-selector-runtime'
import { TOPOLOGY_FACE_ID_NONE } from './build-face-ids'

function loadTestGlb(): ArrayBuffer {
  const filePath = path.resolve('src/test/fixtures/test-box.glb')
  if (!fs.existsSync(filePath)) {
    throw new Error(`Test GLB not found at ${filePath}`)
  }
  const buf = fs.readFileSync(filePath)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

describe('parse-glb-topology', () => {
  let glbBuffer: ArrayBuffer

  beforeAll(() => {
    glbBuffer = loadTestGlb()
  })

  it('parseGlbContainer', () => {
    const glb = parseGlbContainer(glbBuffer)
    expect(glb.json).not.toBeNull()
    expect(glb.bin).not.toBeNull()
    const ext = glb.json.extensions as Record<string, unknown> | undefined
    expect(ext?.STEP_topology).not.toBeNull()
  })

  it('extractSelectorBundle', () => {
    const bundle = extractSelectorBundle(glbBuffer)
    expect(bundle).not.toBeNull()
    expect(typeof bundle.manifest).toBe('object')
    expect(typeof bundle.buffers).toBe('object')
    expect(Array.isArray(bundle.manifest.occurrences)).toBe(true)
    expect(bundle.manifest.occurrences.length).toBeGreaterThan(0)
    expect(Array.isArray(bundle.manifest.faces)).toBe(true)
    expect(bundle.manifest.faces.length).toBeGreaterThan(0)
    expect(Array.isArray(bundle.manifest.edges)).toBe(true)
    expect(bundle.manifest.edges.length).toBeGreaterThan(0)
    expect(bundle.buffers.faceRuns).toBeInstanceOf(Uint32Array)
    expect(bundle.buffers.edgePositions).toBeInstanceOf(Float32Array)
  })

  it('buildSelectorRuntime', () => {
    const bundle = extractSelectorBundle(glbBuffer)!
    const runtime = buildSelectorRuntime(bundle)

    expect(runtime.occurrences.length).toBeGreaterThan(0)
    expect(runtime.faces.length).toBeGreaterThan(0)
    expect(runtime.edges.length).toBeGreaterThan(0)
    expect(runtime.faceReferenceByRowIndex.size).toBe(runtime.faces.length)
    expect(runtime.edgeReferenceByRowIndex.size).toBe(runtime.edges.length)

    expect(runtime.proxy.edgePositions.length).toBeGreaterThan(0)
    expect(runtime.proxy.edgeIndices.length).toBeGreaterThan(0)
    expect(runtime.proxy.edgeIds.length).toBeGreaterThan(0)
    expect(runtime.proxy.faceRuns.length).toBeGreaterThan(0)

    // Face centers populated from face row center fields
    expect(runtime.proxy.faceCenterCount).toBe(runtime.faces.length)
    expect(runtime.proxy.allPointPositions.length).toBeGreaterThan(0)
    // Total pick points = vertices + edge midpoints + face centers
    expect(runtime.proxy.allPointPositions.length / 3).toBe(
      runtime.proxy.vertexPointCount + runtime.proxy.edgeMidCount + runtime.proxy.faceCenterCount,
    )

    for (const edge of runtime.edges) {
      expect(typeof edge.segmentStart).toBe('number')
      expect(edge.segmentStart).toBeGreaterThanOrEqual(0)
      expect(typeof edge.segmentCount).toBe('number')
      expect(edge.segmentCount).toBeGreaterThanOrEqual(0)
    }

    for (const face of runtime.faces) {
      expect(typeof face.triangleStart).toBe('number')
      expect(face.triangleStart).toBeGreaterThanOrEqual(0)
    }
  })

  it('edge proxy data', () => {
    const bundle = extractSelectorBundle(glbBuffer)!
    const runtime = buildSelectorRuntime(bundle)

    expect(runtime.proxy.edgePositions.length % 3).toBe(0)
    expect(runtime.proxy.edgeIndices.length % 2).toBe(0)
    expect(runtime.proxy.edgeIds.length).toBe(runtime.proxy.edgeIndices.length / 2)

    const edgeCount = runtime.edges.length
    for (let i = 0; i < runtime.proxy.edgeIds.length; i++) {
      const edgeRow = runtime.proxy.edgeIds[i]
      expect(edgeRow).toBeLessThan(edgeCount)
      expect(runtime.edgeReferenceByRowIndex.get(edgeRow)).not.toBeNull()
    }
  })

  it('faceRuns', () => {
    const bundle = extractSelectorBundle(glbBuffer)!
    const runtime = buildSelectorRuntime(bundle)

    const runs = runtime.proxy.faceRuns
    expect(runs.length % 5).toBe(0)

    const runCount = runs.length / 5
    const faceCount = runtime.faces.length
    for (let i = 0; i < runCount; i++) {
      const faceRow = runs[i * 5 + 4]
      expect(faceRow).toBeLessThan(faceCount)
      expect(faceRow).not.toBe(TOPOLOGY_FACE_ID_NONE)
    }
  })

  it('edge reference', () => {
    const bundle = extractSelectorBundle(glbBuffer)!
    const runtime = buildSelectorRuntime(bundle)

    const firstEdge = runtime.edges[0]
    expect(firstEdge.curveType).toBe('line')
    expect(typeof firstEdge.length).toBe('number')
    expect(firstEdge.length).toBeGreaterThan(0)

    const firstRef = runtime.edgeReferenceByRowIndex.get(0)
    expect(firstRef).not.toBeNull()
    expect(firstRef.selectorType).toBe('edge')
    expect(firstRef.pickData.segmentStart).not.toBeNull()
    expect(firstRef.pickData.segmentCount).not.toBeNull()
    expect(Array.isArray(firstRef.pickData.adjacentSelectors)).toBe(true)
  })
})
