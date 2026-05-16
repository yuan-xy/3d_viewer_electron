import { useMemo } from 'react'
import * as THREE from 'three'

interface ArrowLineProps {
  color: string
  from: [number, number, number]
  to: [number, number, number]
}

export default function ArrowLine({ color, from, to }: ArrowLineProps) {
  const { lineGeo, coneGeo, groupPos, groupQuat, halfLen } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const dir = b.clone().sub(a)
    const length = dir.length()
    const mid = a.clone().add(b).multiplyScalar(0.5)

    // Orientation: the default CylinderGeometry is along Y. Rotate Y→dir.
    const yAxis = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion().setFromUnitVectors(yAxis, dir.normalize())

    const lg = new THREE.CylinderGeometry(0.03, 0.03, length, 8)
    const cg = new THREE.ConeGeometry(0.08, 0.15, 8)

    return {
      lineGeo: lg,
      coneGeo: cg,
      groupPos: [mid.x, mid.y, mid.z] as [number, number, number],
      groupQuat: [q.x, q.y, q.z, q.w] as [number, number, number, number],
      halfLen: length / 2,
    }
  }, [from, to])

  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, depthTest: false }), [color])

  return (
    <group position={groupPos} quaternion={groupQuat}>
      <mesh geometry={lineGeo} material={mat} />
      <mesh geometry={coneGeo} material={mat} position={[0, halfLen, 0]} />
    </group>
  )
}
