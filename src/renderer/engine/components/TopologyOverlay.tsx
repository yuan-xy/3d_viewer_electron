import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { SelectorRuntime } from '@/lib/topology/types'
import { useModelStore } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import {
  buildFacePickMesh,
  buildEdgePickLines,
  buildPointPickPoints,
} from '@/lib/topology/build-pick-geometry'

interface TopologyOverlayProps {
  selectorRuntime: SelectorRuntime | null
}

/**
 * Invisible pick-proxy overlay for topology selection.
 *
 * Face picking is two-layer (see useTopologyPicking.ts):
 * - PRIMARY:   display meshes (rendered by ModelGroup with per-part faceIds)
 * - FALLBACK:  face-pick-mesh built here (raw STEP_topology geometry)
 *
 * The fallback exists for modes where display meshes are hidden — e.g.
 * wireframe mode where ModelGroup returns null. In normal solid mode the
 * primary path handles everything; the fallback is never reached.
 *
 * All three pick geometries (face mesh, edge lines, vertex points) are
 * fully invisible — opacity 0, colorWrite false, depthWrite false.
 * They only serve as raycaster targets.
 */
export default function TopologyOverlay({ selectorRuntime }: TopologyOverlayProps) {
  const { scene } = useThree()
  const groupRef = useRef<THREE.Group | null>(null)
  const centeringOffset = useModelStore((s) => s.modelCenteringOffset)
  const modelTransform = useEngineStore((s) => s.modelTransform)

  useEffect(() => {
    // Remove previous group
    if (groupRef.current) {
      disposePickGroup(groupRef.current)
      scene.remove(groupRef.current)
      groupRef.current = null
    }

    if (!selectorRuntime) return

    const group = new THREE.Group()
    group.name = 'topology-pick-overlay'

    // Align topology pick overlay with the centered display meshes.
    // ModelGroup centers display meshes by offsetting each mesh by -center.
    // The topology data from the GLB extension is in the original coordinate
    // space, so we offset the entire overlay group by -center to match.
    // Also apply the model's accumulated transform (scale/move/rotate).
    const basePos = centeringOffset
      ? new THREE.Vector3(-centeringOffset[0], -centeringOffset[1], -centeringOffset[2])
      : new THREE.Vector3(0, 0, 0)
    if (modelTransform) {
      basePos.applyMatrix4(modelTransform)
    }
    group.position.copy(basePos)

    const faceMesh = buildFacePickMesh(selectorRuntime)
    if (faceMesh) {
      faceMesh.name = 'face-pick-mesh'
      group.add(faceMesh)
    }

    const edgeLines = buildEdgePickLines(selectorRuntime)
    if (edgeLines) {
      edgeLines.name = 'edge-pick-lines'
      group.add(edgeLines)
    }

    const vertexPoints = buildPointPickPoints(selectorRuntime)
    if (vertexPoints) {
      vertexPoints.name = 'point-pick-points'
      group.add(vertexPoints)
    }

    scene.add(group)
    groupRef.current = group
    console.log('[TopologyOverlay] pick group created, children:', group.children.length,
      'centeringOffset:', centeringOffset,
      'hasFacePick:', !!faceMesh,
      'hasEdgePick:', !!edgeLines,
      'hasVertexPick:', !!vertexPoints)

    return () => {
      if (groupRef.current) {
        disposePickGroup(groupRef.current)
        scene.remove(groupRef.current)
        groupRef.current = null
      }
    }
  }, [selectorRuntime, scene, centeringOffset, modelTransform])

  return null
}

function disposePickGroup(group: THREE.Group) {
  group.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.LineSegments ||
      child instanceof THREE.Points
    ) {
      child.geometry?.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose())
      } else {
        child.material?.dispose()
      }
    }
  })
}
