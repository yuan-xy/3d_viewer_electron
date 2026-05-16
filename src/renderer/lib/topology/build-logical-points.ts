/**
 * Build logical point data — edge midpoints, face centers, and the merged
 * "all points" array used by the point selection pick geometry.
 *
 * All functions are pure: no Three.js dependency, no side effects.
 */

/**
 * Compute edge midpoints from edge line-segment geometry.
 *
 * Each edge row has a `segmentStart` into edgeIndices.  Multi-segment edges
 * (e.g. circles) use the middle segment for a representative midpoint.
 *
 * @param edgeSegmentStarts — segmentStart value per edge (from edge row)
 * @param edgeSegmentCounts — segmentCount value per edge (from edge row)
 */
export function computeEdgeMidpoints(
  edgePositions: Float32Array,
  edgeIndices: Uint32Array,
  edgeSegmentStarts: number[],
  edgeSegmentCounts: number[],
  edgeCount: number,
): Float32Array {
  if (edgePositions.length === 0 || edgeIndices.length === 0 || edgeCount <= 0) {
    return new Float32Array(0)
  }

  const midpoints = new Float32Array(edgeCount * 3)
  for (let i = 0; i < edgeCount; i++) {
    const segStart = edgeSegmentStarts[i] ?? 0
    const segCount = edgeSegmentCounts[i] ?? 1
    // Use the middle segment for multi-segment edges, first for single-segment
    const segIdx = segStart + (segCount > 1 ? Math.floor(segCount / 2) : 0)
    const a = edgeIndices[segIdx * 2] * 3
    const b = edgeIndices[segIdx * 2 + 1] * 3
    if (a + 2 >= edgePositions.length || b + 2 >= edgePositions.length) {
      midpoints[i * 3] = midpoints[i * 3 + 1] = midpoints[i * 3 + 2] = 0
      continue
    }
    midpoints[i * 3] = (edgePositions[a] + edgePositions[b]) / 2
    midpoints[i * 3 + 1] = (edgePositions[a + 1] + edgePositions[b + 1]) / 2
    midpoints[i * 3 + 2] = (edgePositions[a + 2] + edgePositions[b + 2]) / 2
  }
  return midpoints
}

/**
 * Compute face centers from the face proxy triangle geometry.
 *
 * faceRuns is a flat Uint32Array with rows of `stride` columns.
 * The default stride = 5: [occurrenceRow, primitiveIndex, triangleStart, triangleCount, faceRow].
 * Each run maps `triangleCount` triangles (starting at `triangleStart` in faceIndices)
 * to a face identified by `faceRow`.
 *
 * Multiple runs may reference the same faceRow (e.g. when a face's triangles
 * are split across multiple GLB primitives). This function collects all
 * triangle vertices per face and averages their unique positions.
 */
export function computeFaceCenters(
  facePositions: Float32Array,
  faceIndices: Uint32Array,
  faceRuns: Uint32Array,
  faceRunStride: number,
  faceCount: number,
): Float32Array {
  if (facePositions.length === 0 || faceIndices.length === 0 || faceRuns.length === 0 || faceCount <= 0) {
    return new Float32Array(0)
  }

  if (faceRunStride < 5) {
    return new Float32Array(0)
  }

  // Default column indices per faceRunColumnIndexes in build-face-ids.ts
  const colTriangleStart = 2
  const colTriangleCount = 3
  const colFaceRow = 4

  // Build per-face vertex sets
  const faceVertices: Map<string, number>[] = Array.from({ length: faceCount }, () => new Map())

  for (let offset = 0; offset + faceRunStride <= faceRuns.length; offset += faceRunStride) {
    const triangleStart = faceRuns[offset + colTriangleStart]
    const triangleCount = faceRuns[offset + colTriangleCount]
    const faceRow = faceRuns[offset + colFaceRow]

    if (faceRow >= faceCount || triangleCount === 0) continue

    const triEnd = Math.min(triangleStart + triangleCount, faceIndices.length / 3) * 3
    for (let ti = triangleStart * 3; ti < triEnd; ti++) {
      const vi = faceIndices[ti] * 3
      if (vi + 2 >= facePositions.length) continue
      const key = `${facePositions[vi].toFixed(6)},${facePositions[vi + 1].toFixed(6)},${facePositions[vi + 2].toFixed(6)}`
      faceVertices[faceRow].set(key, vi)
    }
  }

  const centers = new Float32Array(faceCount * 3)
  for (let f = 0; f < faceCount; f++) {
    const verts = faceVertices[f]
    if (verts.size === 0) {
      centers[f * 3] = centers[f * 3 + 1] = centers[f * 3 + 2] = 0
      continue
    }
    let sx = 0, sy = 0, sz = 0
    for (const vi of verts.values()) {
      sx += facePositions[vi]
      sy += facePositions[vi + 1]
      sz += facePositions[vi + 2]
    }
    const n = verts.size
    centers[f * 3] = sx / n
    centers[f * 3 + 1] = sy / n
    centers[f * 3 + 2] = sz / n
  }
  return centers
}

export interface AllPointData {
  allPointPositions: Float32Array
  /** 0=vertex, 1=edge-mid, 2=face-center */
  allPointTypes: Uint8Array
  /** Source row index — into vertex/edge/face tables respectively */
  allPointRefIndices: Uint32Array
  vertexPointCount: number
  edgeMidCount: number
  faceCenterCount: number
}

/**
 * Merge vertex positions, edge midpoints, and face centers into a single
 * contiguous buffer suitable for building a THREE.Points pick geometry.
 */
export function buildAllPointData(params: {
  vertexPositions: Float32Array
  vertexIds: Uint32Array
  edgeMidpoints: Float32Array
  faceCenters: Float32Array
  vertexCount: number
  edgeCount: number
  faceCount: number
}): AllPointData {
  const { vertexPositions, edgeMidpoints, faceCenters, vertexCount, edgeCount, faceCount } = params

  const totalPoints = vertexCount + edgeCount + faceCount
  const allPointPositions = new Float32Array(totalPoints * 3)
  const allPointTypes = new Uint8Array(totalPoints)
  const allPointRefIndices = new Uint32Array(totalPoints)

  let offset = 0

  // Vertices (type 0)
  for (let i = 0; i < vertexCount; i++) {
    const si = i * 3
    const di = offset * 3
    allPointPositions[di] = vertexPositions[si]
    allPointPositions[di + 1] = vertexPositions[si + 1]
    allPointPositions[di + 2] = vertexPositions[si + 2]
    allPointTypes[offset] = 0
    allPointRefIndices[offset] = i
    offset++
  }

  // Edge midpoints (type 1)
  // refIndex = vertexCount + i — matches the rowIndex used in
  // build-selector-runtime when creating edge-midpoint References.
  for (let i = 0; i < edgeCount; i++) {
    const si = i * 3
    const di = offset * 3
    allPointPositions[di] = edgeMidpoints[si]
    allPointPositions[di + 1] = edgeMidpoints[si + 1]
    allPointPositions[di + 2] = edgeMidpoints[si + 2]
    allPointTypes[offset] = 1
    allPointRefIndices[offset] = vertexCount + i
    offset++
  }

  // Face centers (type 2)
  // refIndex = vertexCount + edgeCount + i — matches the rowIndex used in
  // build-selector-runtime when creating face-center References.
  for (let i = 0; i < faceCount; i++) {
    const si = i * 3
    const di = offset * 3
    allPointPositions[di] = faceCenters[si]
    allPointPositions[di + 1] = faceCenters[si + 1]
    allPointPositions[di + 2] = faceCenters[si + 2]
    allPointTypes[offset] = 2
    allPointRefIndices[offset] = vertexCount + edgeCount + i
    offset++
  }

  return {
    allPointPositions,
    allPointTypes,
    allPointRefIndices,
    vertexPointCount: vertexCount,
    edgeMidCount: edgeCount,
    faceCenterCount: faceCount,
  }
}
