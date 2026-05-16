import type { SelectorRuntime, Reference } from './types'
import { TOPOLOGY_FACE_ID_NONE } from './build-face-ids'

/**
 * Minimal intersection shape — subset of THREE.Intersection that the
 * pure picking functions need. This keeps the logic testable without
 * a full Three.js setup.
 */
export interface PickIntersection {
  faceIndex?: number | null
  index?: number | null
  object: {
    userData: Record<string, unknown>
  }
}

/**
 * Resolve a face intersection to a topology Reference.
 *
 * faceIds[triangleIndex] → face table row index → faceReferenceByRowIndex lookup.
 */
export function faceReferenceFromIntersection(
  intersection: PickIntersection,
  runtime: SelectorRuntime,
): Reference | null {
  const triangleIndex = Number(intersection?.faceIndex)
  const faceIds = intersection?.object?.userData?.faceIds as Uint32Array | undefined
  const rowIndex = Number.isInteger(triangleIndex) ? Number(faceIds?.[triangleIndex]) : NaN

  if (!Number.isInteger(rowIndex) || rowIndex === TOPOLOGY_FACE_ID_NONE) {
    return null
  }

  return runtime.faceReferenceByRowIndex.get(rowIndex) ?? null
}

/**
 * Resolve an edge intersection to a topology Reference.
 *
 * Intersection index is the vertex offset in LineSegments (0, 2, 4, ...).
 * Divide by 2 to get the segment index, then edgeIds[segmentIndex] → edge table row.
 */
export function edgeReferenceFromIntersection(
  intersection: PickIntersection,
  runtime: SelectorRuntime,
): Reference | null {
  const hitIndex = Number(intersection?.index)
  const edgeIds = intersection?.object?.userData?.edgeIds as Uint32Array | undefined
  const segmentIndex = Number.isInteger(hitIndex) ? Math.floor(hitIndex / 2) : NaN
  const rowIndex = Number.isInteger(segmentIndex) ? Number(edgeIds?.[segmentIndex]) : NaN

  if (!Number.isInteger(rowIndex) || rowIndex === TOPOLOGY_FACE_ID_NONE) {
    return null
  }

  return runtime.edgeReferenceByRowIndex.get(rowIndex) ?? null
}

/**
 * Resolve a vertex intersection to a topology Reference.
 *
 * Intersection index is the point index in the Points geometry.
 * vertexIds[pointIndex] → vertex table row.
 */
export function vertexReferenceFromIntersection(
  intersection: PickIntersection,
  runtime: SelectorRuntime,
): Reference | null {
  const pointIndex = Number(intersection?.index)
  const vertexIds = intersection?.object?.userData?.vertexIds as Uint32Array | undefined
  const rowIndex = Number.isInteger(pointIndex) ? Number(vertexIds?.[pointIndex]) : NaN

  if (!Number.isInteger(rowIndex) || rowIndex === TOPOLOGY_FACE_ID_NONE) {
    return null
  }

  return runtime.vertexReferenceByRowIndex.get(rowIndex) ?? null
}

/**
 * Resolve a point intersection (vertex, edge-mid, or face-center) to a
 * topology Reference.
 *
 * pointRefIndices[pointIndex] → rowIndex → vertexReferenceByRowIndex lookup.
 * The pointTypes array distinguishes vertex(0) / edge-mid(1) / face-center(2).
 */
export function pointReferenceFromIntersection(
  intersection: PickIntersection,
  runtime: SelectorRuntime,
): Reference | null {
  const pointIndex = Number(intersection?.index)
  const pointRefIndices = intersection?.object?.userData?.pointRefIndices as Uint32Array | undefined
  if (!pointRefIndices) {
    // Fallback to old vertexIds-based lookup
    return vertexReferenceFromIntersection(intersection, runtime)
  }
  const rowIndex = Number.isInteger(pointIndex) ? Number(pointRefIndices[pointIndex]) : NaN

  if (!Number.isInteger(rowIndex) || rowIndex === TOPOLOGY_FACE_ID_NONE) {
    return null
  }

  return runtime.vertexReferenceByRowIndex.get(rowIndex) ?? null
}

/**
 * Extract the partId from the closest display-mesh intersection.
 * Used for object-mode picking.
 */
export function partIdFromIntersection(
  intersection: PickIntersection,
): string | null {
  const partId = intersection?.object?.userData?.partId
  return typeof partId === 'string' && partId ? partId : null
}
