import { useMemo, useRef, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

const CUBE_SIZE = 0.7
const CAMERA_DISTANCE = 2.5
const FACE_LABEL_OFFSET = CUBE_SIZE / 2 + 0.02

const FACES = [
  { normal: [0, -1, 0] as [number, number, number], label: '前' },
  { normal: [0, 1, 0] as [number, number, number], label: '后' },
  { normal: [-1, 0, 0] as [number, number, number], label: '左' },
  { normal: [1, 0, 0] as [number, number, number], label: '右' },
  { normal: [0, 0, 1] as [number, number, number], label: '上' },
  { normal: [0, 0, -1] as [number, number, number], label: '下' },
]

function getFaceFromNormal(normal: THREE.Vector3): string | null {
  let bestFace: string | null = null
  let bestDot = -Infinity
  for (const face of FACES) {
    const dot = normal.x * face.normal[0] + normal.y * face.normal[1] + normal.z * face.normal[2]
    if (dot > bestDot) {
      bestDot = dot
      bestFace = face.label
    }
  }
  return bestDot > 0.9 ? bestFace : null
}

interface ViewCubeInnerProps {
  mainCamera?: THREE.Camera | null
  onFaceClick?: (face: string) => void
}

function CubeFaces({ mainCamera, onFaceClick }: ViewCubeInnerProps) {
  const { camera } = useThree()
  const spriteRefs = useRef<Map<string, THREE.Sprite>>(new Map())
  const [hoveredFace, setHoveredFace] = useState<string | null>(null)

  useFrame(() => {
    if (!mainCamera) return

    const camPos = new THREE.Vector3(0, 0, CAMERA_DISTANCE).applyQuaternion(
      mainCamera.quaternion,
    )
    camera.position.copy(camPos)
    camera.up.copy(mainCamera.up)
    camera.lookAt(0, 0, 0)

    const camV = camPos.clone().normalize()
    for (const face of FACES) {
      const normal = new THREE.Vector3(...face.normal)
      const visible = camV.dot(normal) > 0.08
      const sprite = spriteRefs.current.get(face.label)
      if (sprite) {
        sprite.visible = visible
      }
    }
  })

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.face?.normal) {
      const face = getFaceFromNormal(e.face.normal)
      setHoveredFace(face)
      if (window.__r3f_viewcube) window.__r3f_viewcube.hoveredFace = face
    }
  }, [])

  const handlePointerOut = useCallback(() => {
    setHoveredFace(null)
    if (window.__r3f_viewcube) window.__r3f_viewcube.hoveredFace = null
  }, [])

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (e.face?.normal) {
        const face = getFaceFromNormal(e.face.normal)
        if (face) onFaceClick?.(face)
      }
    },
    [onFaceClick],
  )

  const cubeGeo = useMemo(() => new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE), [])
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(cubeGeo), [cubeGeo])

  const labelTexture = useMemo(() => {
    return (text: string) => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')
      if (!ctx) return new THREE.CanvasTexture(canvas)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 72px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 64, 64)
      const tex = new THREE.CanvasTexture(canvas)
      tex.minFilter = THREE.LinearFilter
      return tex
    }
  }, [])

  return (
    <group>
      <directionalLight position={[1, 1, 2]} intensity={1.0} />
      <directionalLight position={[-0.5, -1, -1]} intensity={0.4} />

      {/* Solid cube body */}
      <mesh
        geometry={cubeGeo}
        renderOrder={1}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <meshStandardMaterial
          color="#8899bb"
          roughness={0.3}
          metalness={0.05}
          transparent={false}
          depthWrite={true}
        />
      </mesh>

      {/* Edge lines */}
      <lineSegments geometry={edgeGeo} renderOrder={2}>
        <lineBasicMaterial
          color="#ffffff"
          opacity={0.7}
          transparent
        />
      </lineSegments>

      {/* Face label sprites — flush against cube surface */}
      {FACES.map((face) => (
        <sprite
          key={face.label}
          ref={(el) => {
            if (el) spriteRefs.current.set(face.label, el)
          }}
          position={face.normal.map((v) => v * FACE_LABEL_OFFSET) as [number, number, number]}
          scale={[0.28, 0.28, 1]}
          renderOrder={3}
          raycast={() => {}}
        >
          <spriteMaterial
            map={labelTexture(face.label)}
            color={hoveredFace === face.label ? '#ffcc33' : '#ffffff'}
            depthTest={false}
            transparent
          />
        </sprite>
      ))}
    </group>
  )
}

interface ViewCubeOverlayProps {
  mainCamera?: THREE.Camera | null
  onFaceClick?: (face: string) => void
  onReset?: () => void
  onDragRotate?: (deltaX: number, deltaY: number) => void
}

export default function ViewCube({ mainCamera, onFaceClick, onReset, onDragRotate }: ViewCubeOverlayProps) {
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    lastPosRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!lastPosRef.current) return
    const dx = e.clientX - lastPosRef.current.x
    const dy = e.clientY - lastPosRef.current.y
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      onDragRotate?.(dx, dy)
      lastPosRef.current = { x: e.clientX, y: e.clientY }
    }
  }, [onDragRotate])

  const handlePointerUp = useCallback(() => {
    lastPosRef.current = null
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 5,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 4,
        zIndex: 1,
      }}
      data-testid="view-cube"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {onReset && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onReset()
          }}
          style={{
            width: 16,
            height: 16,
            borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.2)',
            background: 'rgba(255,255,255,0.9)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
            marginTop: 0,
          }}
          title="Reset camera"
          data-testid="camera-reset-button"
        >
          ⟲
        </button>
      )}
      <div
        style={{
          width: 65,
          height: 75,
          pointerEvents: 'auto',
          cursor: 'default',
        }}
      >
        <Canvas
          orthographic
          camera={{ zoom: 50, up: [0, 0, 1] as [number, number, number] }}
          scene={{ up: [0, 0, 1] as unknown as THREE.Vector3 }}
          gl={{ alpha: true, preserveDrawingBuffer: true }}
          style={{ width: '100%', height: '100%' }}
          onCreated={({ camera, scene, gl }) => {
            window.__r3f_viewcube = { camera, scene, gl }
          }}
        >
          <ambientLight intensity={0.7} />
          <CubeFaces mainCamera={mainCamera} onFaceClick={onFaceClick} />
        </Canvas>
      </div>
    </div>
  )
}
