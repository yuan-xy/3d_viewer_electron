import { useMemo } from 'react'
import * as THREE from 'three'
import type { SelectorRuntime } from '@/lib/topology/types'

interface DebugTopologyOverlayProps {
  selectorRuntime: SelectorRuntime
  centeringOffset: [number, number, number] | null
  showVertices?: boolean
}

export default function DebugTopologyOverlay({ selectorRuntime, centeringOffset, showVertices = true }: DebugTopologyOverlayProps) {
  const proxy = selectorRuntime.proxy

  const faceGeo = useMemo(() => {
    if (!(proxy.facePositions instanceof Float32Array) || proxy.facePositions.length === 0) return null
    if (!(proxy.faceIndices instanceof Uint32Array) || proxy.faceIndices.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(proxy.facePositions, 3))
    geo.setIndex(new THREE.BufferAttribute(proxy.faceIndices, 1))
    return geo
  }, [proxy.facePositions, proxy.faceIndices])

  const edgeGeo = useMemo(() => {
    if (!(proxy.edgePositions instanceof Float32Array) || proxy.edgePositions.length === 0) return null
    if (!(proxy.edgeIndices instanceof Uint32Array) || proxy.edgeIndices.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(proxy.edgePositions, 3))
    geo.setIndex(new THREE.BufferAttribute(proxy.edgeIndices, 1))
    return geo
  }, [proxy.edgePositions, proxy.edgeIndices])

  const vertexGeo = useMemo(() => {
    if (!(proxy.vertexPositions instanceof Float32Array) || proxy.vertexPositions.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(proxy.vertexPositions, 3))
    return geo
  }, [proxy.vertexPositions])

  // Log STEP_topology extension data
  useMemo(() => {
    const { occurrences, shapes, faces, edges, vertices } = selectorRuntime

    const faceByType = new Map<string, number>()
    for (const f of faces) {
      const t = f.surfaceType || '?'
      faceByType.set(t, (faceByType.get(t) || 0) + 1)
    }
    const edgeByType = new Map<string, number>()
    for (const e of edges) {
      const t = e.curveType || '?'
      edgeByType.set(t, (edgeByType.get(t) || 0) + 1)
    }

    console.log(
      `[STEP_topology] ${occurrences.length} occurrences, ${shapes.length} shapes, ${faces.length} faces, ${edges.length} edges, ${vertices.length} vertices`,
      '\n  faces by type:', Object.fromEntries(faceByType),
      '\n  edges by type:', Object.fromEntries(edgeByType),
    )
    if (faces.length > 0) console.table(faces.map((f, _i) => ({
      id: f.id,
      type: f.surfaceType ?? '?',
      area: f.area != null ? Number(f.area.toFixed(4)) : '-',
      edgeCount: f.edgeCount ?? '-',
    })))
    if (edges.length > 0) console.table(edges.map((e, _i) => ({
      id: e.id,
      type: e.curveType ?? '?',
      length: e.length != null ? Number(e.length.toFixed(4)) : '-',
      segCount: e.segmentCount ?? '-',
    })))
    if (occurrences.length > 0) console.table(occurrences.map((o, _i) => ({
      id: o.id,
      name: o.name ?? '-',
      faceCount: o.faceCount ?? '-',
      edgeCount: o.edgeCount ?? '-',
    })))
    return null
  }, [selectorRuntime])

  const offset = centeringOffset
    ? new THREE.Vector3(-centeringOffset[0], -centeringOffset[1], -centeringOffset[2])
    : new THREE.Vector3()

  return (
    <group position={offset}>
      {faceGeo && (
        <mesh geometry={faceGeo} frustumCulled={false} renderOrder={2}>
          <meshBasicMaterial
            color="#4488ff"
            side={THREE.DoubleSide}
            transparent
            opacity={0.25}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}
      {edgeGeo && (
        <lineSegments geometry={edgeGeo} frustumCulled={false} renderOrder={4}>
          <lineBasicMaterial color="#44ff44" depthTest={false} depthWrite={false} />
        </lineSegments>
      )}
      {showVertices && vertexGeo && (
        <points geometry={vertexGeo} frustumCulled={false} renderOrder={3}>
          <pointsMaterial
            color="#ff4444"
            size={5}
            sizeAttenuation={false}
            depthTest={false}
            depthWrite={false}
          />
        </points>
      )}
    </group>
  )
}
