import type { SelectorRuntime } from './types'

/**
 * A candidate point for snapping, returned by findClosestPointPure.
 */
export interface SnapCandidate {
  pointIndex: number
  worldPosition: [number, number, number]
  screenX: number
  screenY: number
  distancePx: number
  /** 0=vertex, 1=edge-mid, 2=face-center */
  pointType: 0 | 1 | 2
  referenceRowIndex: number
}

/**
 * Find the closest candidate point to the cursor in pixel space.
 *
 * Pure function — no Three.js or DOM dependency. The caller pre-projects
 * all world-space points to screen coordinates (e.g. via Three.js camera)
 * and passes them in as `screenCoords`.
 *
 * Priority (when distances are equal): vertex > edge-mid > face-center.
 *
 * @param clientX / clientY — cursor position relative to viewport
 * @param rect — canvas bounding rect { left, top, width, height }
 * @param allPointPositions — world-space positions for all points (from proxy)
 * @param allPointTypes — 0=vertex, 1=edge-mid, 2=face-center
 * @param allPointRefIndices — source row index into vertex/edge/face tables
 * @param screenCoords — pre-projected screen-x, screen-y per point (length = pointCount × 2)
 * @param snapRadiusPx — max pixel distance to consider a snap
 * @returns the closest candidate, or null if all are outside the radius
 */
export function findClosestPointPure(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  allPointPositions: Float32Array,
  allPointTypes: Uint8Array,
  allPointRefIndices: Uint32Array,
  screenCoords: Float32Array,
  snapRadiusPx: number = 24,
): SnapCandidate | null {
  const pointCount = allPointPositions.length / 3
  if (pointCount === 0 || screenCoords.length < pointCount * 2) return null

  const cx = clientX - rect.left
  const cy = clientY - rect.top

  let best: SnapCandidate | null = null
  let bestDist = snapRadiusPx
  let bestType = 3 // higher = lower priority

  for (let i = 0; i < pointCount; i++) {
    const sx = screenCoords[i * 2]
    const sy = screenCoords[i * 2 + 1]

    // Skip points behind the camera (projected z > 1 → screenCoords may be NaN)
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue
    // Skip points outside the viewport (far off screen)
    if (sx < -rect.width || sx > rect.width * 2 || sy < -rect.height || sy > rect.height * 2) continue

    const dx = cx - sx
    const dy = cy - sy
    const dist = Math.hypot(dx, dy)

    const pType = allPointTypes[i] ?? 0

    if (
      dist < bestDist ||
      (dist === bestDist && pType < bestType) // lower type number = higher priority
    ) {
      bestDist = dist
      bestType = pType
      best = {
        pointIndex: i,
        worldPosition: [
          allPointPositions[i * 3],
          allPointPositions[i * 3 + 1],
          allPointPositions[i * 3 + 2],
        ],
        screenX: sx,
        screenY: sy,
        distancePx: dist,
        pointType: pType as 0 | 1 | 2,
        referenceRowIndex: allPointRefIndices[i],
      }
    }
  }

  return best
}

/**
 * Build a SnapCandidate from the runtime using a Three.js camera for projection.
 * This is the integration wrapper — call it from the R3F hook.
 *
 * Not testable without WebGL; findClosestPointPure is the testable core.
 */
export function findClosestPoint(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: { projectionMatrix: { elements: number[] }; matrixWorldInverse: { elements: number[] } },
  runtime: SelectorRuntime,
  snapRadiusPx: number = 24,
  centeringOffset?: [number, number, number] | null,
): SnapCandidate | null {
  const rect = canvas.getBoundingClientRect()
  const { allPointPositions, allPointTypes, allPointRefIndices } = runtime.proxy
  const pointCount = allPointPositions.length / 3
  if (pointCount === 0) return null

  // When the display mesh is centered, the topology pick overlay is offset
  // by -centeringOffset to align with it.  allPointPositions are in original
  // CAD coordinates, so we must apply the same offset before projecting.
  let positions = allPointPositions
  if (centeringOffset) {
    positions = new Float32Array(allPointPositions.length)
    for (let i = 0; i < pointCount; i++) {
      positions[i * 3] = allPointPositions[i * 3] - centeringOffset[0]
      positions[i * 3 + 1] = allPointPositions[i * 3 + 1] - centeringOffset[1]
      positions[i * 3 + 2] = allPointPositions[i * 3 + 2] - centeringOffset[2]
    }
  }

  // Pre-project all points to screen space using the full camera matrices
  const screenCoords = projectPoints(
    positions,
    camera.projectionMatrix.elements,
    camera.matrixWorldInverse.elements,
    rect.width,
    rect.height,
  )

  return findClosestPointPure(
    clientX, clientY, rect,
    allPointPositions, allPointTypes, allPointRefIndices,
    screenCoords, snapRadiusPx,
  )
}

/**
 * Project an array of world-space points to screen coordinates.
 * Uses the standard MVP pipeline: world → view → clip → NDC → screen.
 */
function projectPoints(
  positions: Float32Array,
  proj: number[],
  viewInv: number[],
  viewWidth: number,
  viewHeight: number,
): Float32Array {
  const pointCount = positions.length / 3
  const result = new Float32Array(pointCount * 2)

  for (let i = 0; i < pointCount; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const z = positions[i * 3 + 2]

    // view-space transform (world → view)
    const vx = viewInv[0] * x + viewInv[4] * y + viewInv[8] * z + viewInv[12]
    const vy = viewInv[1] * x + viewInv[5] * y + viewInv[9] * z + viewInv[13]
    const vz = viewInv[2] * x + viewInv[6] * y + viewInv[10] * z + viewInv[14]
    const vw = viewInv[3] * x + viewInv[7] * y + viewInv[11] * z + viewInv[15]

    // clip-space (view → clip)
    const cx = proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12] * vw
    const cy = proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13] * vw
    const cz = proj[2] * vx + proj[6] * vy + proj[10] * vz + proj[14] * vw
    const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw

    if (Math.abs(cw) < 1e-9) {
      result[i * 2] = NaN
      result[i * 2 + 1] = NaN
      continue
    }

    // NDC
    const ndcX = cx / cw
    const ndcY = cy / cw

    // Behind camera (ndc.z > 1 in clip space → in NDC, z > 1 means behind)
    if (cz / cw > 1 || cz / cw < -1) {
      result[i * 2] = NaN
      result[i * 2 + 1] = NaN
      continue
    }

    // Screen coordinates
    result[i * 2] = (ndcX + 1) * 0.5 * viewWidth
    result[i * 2 + 1] = (-ndcY + 1) * 0.5 * viewHeight
  }

  return result
}
