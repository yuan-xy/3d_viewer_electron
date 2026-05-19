import { describe, it, expect } from 'vitest'
import { findClosestPointPure } from './snap'

function makePoints(count: number): {
  positions: Float32Array
  types: Uint8Array
  refIndices: Uint32Array
  screenCoords: Float32Array
} {
  const positions = new Float32Array(count * 3)
  const types = new Uint8Array(count)
  const refIndices = new Uint32Array(count)
  const screenCoords = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = i * 10
    positions[i * 3 + 1] = i * 10
    positions[i * 3 + 2] = 0
    screenCoords[i * 2] = i * 100
    screenCoords[i * 2 + 1] = i * 100
    types[i] = (i % 3) as 0 | 1 | 2 // 0=vertex, 1=edge-mid, 2=face-center
    refIndices[i] = i
  }
  return { positions, types, refIndices, screenCoords }
}

const rect = { left: 0, top: 0, width: 800, height: 600 }

describe('findClosestPointPure', () => {
  it('returns null for empty input', () => {
    const empty = new Float32Array(0)
    expect(findClosestPointPure(400, 300, rect, empty, new Uint8Array(0), new Uint32Array(0), new Float32Array(0))).toBeNull()
  })

  it('finds the closest point to cursor', () => {
    const pts = makePoints(3)
    // Cursor exactly at point 1's screen coordinates
    const result = findClosestPointPure(100, 100, rect, pts.positions, pts.types, pts.refIndices, pts.screenCoords)
    expect(result).not.toBeNull()
    expect(result!.pointIndex).toBe(1)
    expect(result!.distancePx).toBe(0)
  })

  it('prefers vertex over edge-mid when equidistant', () => {
    // Two points at same screen position, one vertex (type 0), one edge-mid (type 1)
    const positions = new Float32Array([1, 0, 0, 2, 0, 0])
    const types = new Uint8Array([0, 1]) // vertex, edge-mid
    const refIndices = new Uint32Array([10, 20])
    const screenCoords = new Float32Array([100, 100, 100, 100]) // same screen position

    const result = findClosestPointPure(100, 100, rect, positions, types, refIndices, screenCoords)
    expect(result).not.toBeNull()
    expect(result!.pointType).toBe(0) // vertex preferred
    expect(result!.referenceRowIndex).toBe(10)
  })

  it('prefers edge-mid over face-center when equidistant', () => {
    const positions = new Float32Array([1, 0, 0, 2, 0, 0])
    const types = new Uint8Array([1, 2]) // edge-mid, face-center
    const refIndices = new Uint32Array([10, 20])
    const screenCoords = new Float32Array([100, 100, 100, 100])

    const result = findClosestPointPure(100, 100, rect, positions, types, refIndices, screenCoords)
    expect(result).not.toBeNull()
    expect(result!.pointType).toBe(1) // edge-mid preferred over face-center
  })

  it('returns null when all points are outside snap radius', () => {
    const pts = makePoints(3)
    // Cursor far from all points (screen coords at 0,0 100,100 200,200, cursor at 700,500)
    const result = findClosestPointPure(700, 500, rect, pts.positions, pts.types, pts.refIndices, pts.screenCoords, 10)
    expect(result).toBeNull()
  })

  it('accounts for rect offset', () => {
    const pts = makePoints(2)
    const offsetRect = { left: 50, top: 30, width: 800, height: 600 }
    // Point 0 screen coords = [0, 0], cursor at [50, 30] → relative [0, 0]
    const result = findClosestPointPure(50, 30, offsetRect, pts.positions, pts.types, pts.refIndices, pts.screenCoords)
    expect(result).not.toBeNull()
    expect(result!.distancePx).toBe(0)
  })

  it('skips NaN screen coordinates', () => {
    const positions = new Float32Array([1, 0, 0, 2, 0, 0])
    const types = new Uint8Array([0, 0])
    const refIndices = new Uint32Array([10, 20])
    const screenCoords = new Float32Array([NaN, NaN, 200, 200])

    const result = findClosestPointPure(200, 200, rect, positions, types, refIndices, screenCoords)
    expect(result).not.toBeNull()
    expect(result!.referenceRowIndex).toBe(20) // second point (not the NaN one)
  })

  it('skips points outside viewport', () => {
    const positions = new Float32Array([1, 0, 0, 2, 0, 0])
    const types = new Uint8Array([0, 0])
    const refIndices = new Uint32Array([10, 20])
    // First point far off screen, second near cursor
    const screenCoords = new Float32Array([-2000, -2000, 100, 100])

    const result = findClosestPointPure(100, 100, rect, positions, types, refIndices, screenCoords)
    expect(result).not.toBeNull()
    expect(result!.referenceRowIndex).toBe(20)
  })

  it('returns correct world position for best match', () => {
    const positions = new Float32Array([1.5, 2.5, 3.5])
    const types = new Uint8Array([0])
    const refIndices = new Uint32Array([0])
    const screenCoords = new Float32Array([400, 300])

    const result = findClosestPointPure(400, 300, rect, positions, types, refIndices, screenCoords)
    expect(result!.worldPosition).toEqual([1.5, 2.5, 3.5])
  })

  it('uses custom snap radius', () => {
    const positions = new Float32Array([0, 0, 0])
    const types = new Uint8Array([0])
    const refIndices = new Uint32Array([0])
    const screenCoords = new Float32Array([100, 100])

    // Distance from (200,200) to (100,100) ≈ 141px, > 100px radius
    const far = findClosestPointPure(200, 200, rect, positions, types, refIndices, screenCoords, 100)
    expect(far).toBeNull()

    // Within 200px radius
    const near = findClosestPointPure(200, 200, rect, positions, types, refIndices, screenCoords, 200)
    expect(near).not.toBeNull()
  })
})
