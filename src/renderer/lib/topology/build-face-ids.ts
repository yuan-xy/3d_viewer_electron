import type { SelectorRuntime } from './types'

export const TOPOLOGY_FACE_ID_NONE = 0xffffffff

interface FaceRunColumns {
  stride: number
  occurrenceRow: number
  primitiveIndex: number
  triangleStart: number
  triangleCount: number
  faceRow: number
}

export function faceRunColumnIndexes(runtime: SelectorRuntime): FaceRunColumns {
  const columns =
    Array.isArray(runtime.proxy.faceRunColumns) && runtime.proxy.faceRunColumns.length > 0
      ? runtime.proxy.faceRunColumns
      : ['occurrenceRow', 'primitiveIndex', 'triangleStart', 'triangleCount', 'faceRow']

  return {
    stride: columns.length,
    occurrenceRow: Math.max(0, columns.indexOf('occurrenceRow')),
    primitiveIndex: Math.max(0, columns.indexOf('primitiveIndex')),
    triangleStart: Math.max(0, columns.indexOf('triangleStart')),
    triangleCount: Math.max(0, columns.indexOf('triangleCount')),
    faceRow: Math.max(0, columns.indexOf('faceRow')),
  }
}

export interface GlbPartMeshInfo {
  occurrenceId: string
  primitiveIndex: number
  triangleCount: number
}

/**
 * Build a per-triangle faceId array for one GLB part/mesh.
 * Each entry is either a face table row index or TOPOLOGY_FACE_ID_NONE.
 */
export function buildGlbFaceIdsForPart(
  part: GlbPartMeshInfo,
  runtime: SelectorRuntime,
): Uint32Array | null {
  const runs = runtime.proxy.faceRuns
  const triangleCount = Math.max(0, Math.floor(Number(part.triangleCount || 0)))

  if (!(runs instanceof Uint32Array) || runs.length === 0 || triangleCount <= 0) {
    return null
  }

  const occurrenceId = String(part.occurrenceId || '').trim()
  if (!occurrenceId) {
    return null
  }

  const primitiveIndex = Math.max(0, Math.floor(Number(part.primitiveIndex || 0)))
  const cols = faceRunColumnIndexes(runtime)
  const faceIds = new Uint32Array(triangleCount)
  faceIds.fill(TOPOLOGY_FACE_ID_NONE)

  let matched = false

  for (let offset = 0; offset + cols.stride <= runs.length; offset += cols.stride) {
    const runOccurrenceRow = Number(runs[offset + cols.occurrenceRow])
    const triangleStart = Number(runs[offset + cols.triangleStart])
    const runTriangleCount = Number(runs[offset + cols.triangleCount])
    const faceRow = Number(runs[offset + cols.faceRow])

    if (
      !Number.isInteger(triangleStart) ||
      !Number.isInteger(runTriangleCount) ||
      !Number.isInteger(faceRow) ||
      triangleStart < 0 ||
      runTriangleCount <= 0 ||
      faceRow < 0
    ) {
      continue
    }

    const runOccurrenceId = runtime.occurrenceIdByRowIndex.get(runOccurrenceRow)
    if (
      runOccurrenceId !== occurrenceId ||
      Number(runs[offset + cols.primitiveIndex]) !== primitiveIndex ||
      triangleStart >= triangleCount
    ) {
      continue
    }

    const end = Math.min(triangleStart + runTriangleCount, triangleCount)
    faceIds.fill(faceRow, triangleStart, end)
    matched = true
  }

  return matched ? faceIds : null
}
