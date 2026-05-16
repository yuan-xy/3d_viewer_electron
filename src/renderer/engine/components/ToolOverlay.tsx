import { useToolStore } from '@/stores/tool-store'
import { TransformControls } from '@react-three/drei'
import type * as THREE from 'three'

interface ToolOverlayProps {
  modelRef: React.RefObject<THREE.Group | null>
}

export default function ToolOverlay({ modelRef }: ToolOverlayProps) {
  const mode = useToolStore((s) => s.activeToolMode)
  const transformMode = useToolStore((s) => s.transformMode)

  if (mode !== 'objectTransform') return null

  return (
    <TransformControls
      object={modelRef as React.RefObject<THREE.Object3D>}
      mode={transformMode}
    />
  )
}
