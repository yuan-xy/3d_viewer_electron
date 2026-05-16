import { useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import ArrowLine from './ArrowLine'

const AXIS_LENGTH = 0.6
const LABEL_OFFSET = 0.2
const CAMERA_DISTANCE = 2

interface AxesIndicatorOverlayProps {
  mainCamera?: THREE.Camera | null
}

function AxesArrows({ mainCamera }: AxesIndicatorOverlayProps) {
  const { camera } = useThree()

  useFrame(() => {
    if (mainCamera) {
      // Position indicator camera opposite to the main camera's look direction.
      // mainCamera's local +Z is its "back" direction (opposite to look).
      // Applying mainCamera.quaternion to (0, 0, distance) gives the world-space
      // position "behind" the origin, so the indicator camera sees the world axes
      // from the same angle as the main camera.
      const camPos = new THREE.Vector3(0, 0, CAMERA_DISTANCE).applyQuaternion(
        mainCamera.quaternion,
      )
      camera.position.copy(camPos)
      camera.up.copy(mainCamera.up)
      camera.lookAt(0, 0, 0)
    }
  })

  const labelTexture = useMemo(
    () => {
      console.log('[AxesIndicator] creating label textures')
      return (text: string) => {
        const canvas = document.createElement('canvas')
        canvas.width = 64
        canvas.height = 64
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          console.error('[AxesIndicator] failed to get 2d context for label:', text)
          return new THREE.CanvasTexture(canvas)
        }
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 48px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, 32, 32)
        const tex = new THREE.CanvasTexture(canvas)
        tex.minFilter = THREE.LinearFilter
        return tex
      }
    },
    [],
  )

  return (
    <group>
      {/* Origin sphere */}
      <mesh>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} />
      </mesh>

      {/* X axis (red, +X direction) — default view: bottom-right on screen */}
      <ArrowLine color="#ff4444" from={[0, 0, 0]} to={[AXIS_LENGTH, 0, 0]} />
      <sprite position={[AXIS_LENGTH + LABEL_OFFSET, 0, 0]} scale={[0.28, 0.28, 1]}>
        <spriteMaterial map={labelTexture('X')} depthTest={false} />
      </sprite>

      {/* Y axis (green, +Y direction) — default view: -Y direction points bottom-left */}
      <ArrowLine color="#44ff44" from={[0, 0, 0]} to={[0, AXIS_LENGTH, 0]} />
      <sprite position={[0, AXIS_LENGTH + LABEL_OFFSET, 0]} scale={[0.28, 0.28, 1]}>
        <spriteMaterial map={labelTexture('Y')} depthTest={false} />
      </sprite>

      {/* Z axis (blue, +Z direction) — default view: straight up on screen */}
      <ArrowLine color="#4488ff" from={[0, 0, 0]} to={[0, 0, AXIS_LENGTH]} />
      <sprite position={[0, 0, AXIS_LENGTH + LABEL_OFFSET]} scale={[0.28, 0.28, 1]}>
        <spriteMaterial map={labelTexture('Z')} depthTest={false} />
      </sprite>
    </group>
  )
}

export default function AxesIndicator({ mainCamera }: AxesIndicatorOverlayProps) {
  console.log('[AxesIndicator] mounting overlay, mainCamera present:', !!mainCamera)

  return (
    <div
      style={{
        position: 'absolute',
        left: 1,
        bottom: 1,
        width: 120,
        height: 120,
        pointerEvents: 'none',
        zIndex: 1,
      }}
      data-testid="axes-indicator"
    >
      <Canvas
        orthographic
        camera={{ zoom: 50, up: [0, 0, 1] as [number, number, number] }}
        scene={{ up: [0, 0, 1] as unknown as THREE.Vector3 }}
        gl={{ alpha: true, preserveDrawingBuffer: true }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ camera, scene, gl }) => {
          window.__r3f_indicator = { camera, scene, gl }
        }}
      >
        <ambientLight intensity={1} />
        <AxesArrows mainCamera={mainCamera} />
      </Canvas>
    </div>
  )
}
