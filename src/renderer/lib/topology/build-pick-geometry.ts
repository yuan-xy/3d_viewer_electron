import * as THREE from 'three'
import type { SelectorRuntime } from './types'

/**
 * Build an invisible "raycatcher" mesh for face picking.
 *
 * Face picking has two layers (see useTopologyPicking.ts):
 * 1. PRIMARY — hit the visible display meshes rendered by ModelGroup.
 *    These carry per-part faceIds (built by buildGlbFaceIdsForPart) and
 *    work for all normal display modes.
 * 2. FALLBACK — this invisible mesh, built from raw STEP_topology extension
 *    data (proxy.facePositions / faceIndices / faceIds). Needed when
 *    display meshes are absent (e.g. wireframe mode where ModelGroup
 *    returns null).
 *
 * Material is fully non-rendering (opacity 0, colorWrite false) — it only
 * exists to receive raycaster intersections.
 */
export function buildFacePickMesh(runtime: SelectorRuntime): THREE.Mesh | null {
  const proxy = runtime.proxy

  if (
    !(proxy.facePositions instanceof Float32Array) ||
    !(proxy.faceIndices instanceof Uint32Array) ||
    proxy.faceIndices.length === 0
  ) {
    return null
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(proxy.facePositions, 3))
  geometry.setIndex(new THREE.BufferAttribute(proxy.faceIndices, 1))

  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    colorWrite: false,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.faceIds = proxy.faceIds || new Uint32Array(0)
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  mesh.name = 'face-pick-mesh'

  return mesh
}

/**
 * Build invisible line segments over model edges for raycaster-based
 * edge picking. Each segment index maps to an edge table row via
 * userData.edgeIds.
 */
export function buildEdgePickLines(runtime: SelectorRuntime): THREE.LineSegments | null {
  const proxy = runtime.proxy

  if (
    !(proxy.edgePositions instanceof Float32Array) ||
    !(proxy.edgeIndices instanceof Uint32Array) ||
    proxy.edgeIndices.length === 0
  ) {
    return null
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(proxy.edgePositions, 3))
  geometry.setIndex(new THREE.BufferAttribute(proxy.edgeIndices, 1))

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  })

  const lines = new THREE.LineSegments(geometry, material)
  lines.userData.edgeIds = proxy.edgeIds || new Uint32Array(0)
  lines.frustumCulled = false
  lines.renderOrder = 1
  lines.name = 'edge-pick-lines'

  return lines
}

/**
 * Build invisible points at model vertices, edge midpoints, and face centers
 * for raycaster-based point picking. Each point index maps to a reference
 * via userData.pointRefIndices + userData.pointTypes.
 */
export function buildPointPickPoints(runtime: SelectorRuntime): THREE.Points | null {
  const { allPointPositions, allPointTypes, allPointRefIndices } = runtime.proxy

  if (!(allPointPositions instanceof Float32Array) || allPointPositions.length === 0) {
    return null
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(allPointPositions, 3))

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    size: 0,
    sizeAttenuation: false,
    depthWrite: false,
    toneMapped: false,
    colorWrite: false,
  })

  const points = new THREE.Points(geometry, material)
  points.userData = {
    vertexIds: runtime.proxy.vertexIds,
    pointTypes: allPointTypes instanceof Uint8Array ? allPointTypes : new Uint8Array(0),
    pointRefIndices: allPointRefIndices instanceof Uint32Array ? allPointRefIndices : new Uint32Array(0),
  }
  points.frustumCulled = false
  points.renderOrder = 1
  points.name = 'point-pick-points'

  return points
}
