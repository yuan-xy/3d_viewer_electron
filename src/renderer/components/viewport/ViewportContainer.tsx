import { useRef, useCallback, useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useModelStore } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import { useUIStore } from '@/stores/ui-store'
import { useToolStore } from '@/stores/tool-store'
import { useSelectionStore } from '@/stores/selection-store'
import type { SnapCandidate } from '@/lib/topology/snap'
import { extractSelectorBundle } from '@/lib/topology/parse-glb-topology'
import { buildSelectorRuntime } from '@/lib/topology/build-selector-runtime'
import SceneSetup from '@/engine/components/SceneSetup'
import ModelGroup from '@/engine/components/ModelGroup'
import TopologyOverlay from '@/engine/components/TopologyOverlay'
import SelectionHighlight from '@/engine/components/SelectionHighlight'
import SelectionToolbar from '@/engine/components/SelectionToolbar'
import DisplayModeDropdown from '@/engine/components/DisplayModeDropdown'
import DebugTopologyOverlay from '@/engine/components/DebugTopologyOverlay'
import type { DisplayMode } from '@/engine/components/DisplayModeDropdown'
import SelectionInfoOverlay from '@/engine/components/SelectionInfoOverlay'

import AxesIndicator from '@/engine/components/AxesIndicator'
import ViewCube from '@/engine/components/ViewCube'
import ToolOverlay from '@/engine/components/ToolOverlay'
import TopologyPicker from '@/engine/components/TopologyPicker'
import { toast } from 'sonner'

function ModelTransformTracker({ modelRef }: { modelRef: React.RefObject<THREE.Group | null> }) {
  const setModelTransform = useEngineStore((s) => s.setModelTransform)

  useFrame(() => {
    if (modelRef.current) {
      modelRef.current.updateWorldMatrix(true, false)
      setModelTransform(modelRef.current.matrixWorld.clone())
    } else {
      setModelTransform(null)
    }
  })

  return null
}

const FACE_DIRECTIONS: Record<string, [number, number, number]> = {
  前: [0, -1, 0],
  后: [0, 1, 0],
  左: [-1, 0, 0],
  右: [1, 0, 0],
  上: [0, 0, 1],
  下: [0, 0, -1],
}

function CameraAnimator({
  targetPos,
  targetUp,
  controlsRef,
  active,
  onDone,
}: {
  targetPos: THREE.Vector3 | null
  targetUp: THREE.Vector3 | null
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  active: boolean
  onDone: () => void
}) {
  const { camera } = useThree()
  const startPos = useRef(new THREE.Vector3())
  const startUp = useRef(new THREE.Vector3())
  const elapsed = useRef(0)
  const duration = 1.0

  useFrame((_, delta) => {
    if (!active || !targetPos || !targetUp) return

    const controls = controlsRef.current
    if (!controls) return

    if (elapsed.current === 0) {
      startPos.current.copy(camera.position)
      startUp.current.copy(camera.up)
    }

    elapsed.current += delta
    let t = Math.min(elapsed.current / duration, 1.0)
    t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

    camera.position.lerpVectors(startPos.current, targetPos, t)
    camera.up.copy(startUp.current).lerp(targetUp, t).normalize()
    controls.target.set(0, 0, 0)
    controls.update()

    if (elapsed.current >= duration) {
      elapsed.current = 0
      onDone()
    }
  })

  return null
}

export default function ViewportContainer() {
  const { t } = useTranslation()
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const modelGroupRef = useRef<THREE.Group>(null)
  const mainCamera = useEngineStore((s) => s.camera)
  const modelBuffer = useModelStore((s) => s.modelBuffer)
  const modelFormat = useModelStore((s) => s.modelFormat)

  const activeToolMode = useToolStore((s) => s.activeToolMode)
  const centeringOffset = useModelStore((s) => s.modelCenteringOffset)
  const theme = useUIStore((s) => s.theme)

  const canvasBackground = useMemo(() => {
    return theme === 'dark' ? '#1a1a2e' : '#f8f8f8'
  }, [theme])

  const [animTarget, setAnimTarget] = useState<THREE.Vector3 | null>(null)
  const [animTargetUp, setAnimTargetUp] = useState<THREE.Vector3 | null>(null)
  const [animActive, setAnimActive] = useState(false)
  const pendingBoxRef = useRef<THREE.Box3 | null>(null)

  // Topology selection state
  const selectorRuntime = useMemo(() => {
    if (modelFormat !== 'glb' || !modelBuffer) return null
    try {
      const bundle = extractSelectorBundle(modelBuffer)
      if (!bundle) return null
      return buildSelectorRuntime(bundle, {})
    } catch {
      return null
    }
  }, [modelBuffer, modelFormat])
  const hasTopology = selectorRuntime !== null
  const selectionMode = useToolStore((s) => s.selectionMode)
  const hoveredReferenceId = useSelectionStore((s) => s.hoveredReferenceId)
  const selectedReferenceId = useSelectionStore((s) => s.selectedReferenceId)
  const setHoveredReference = useSelectionStore((s) => s.setHoveredReference)
  const setSelectedReference = useSelectionStore((s) => s.setSelectedReference)
  const [snapCandidate, setSnapCandidate] = useState<SnapCandidate | null>(null)
  const [rawClickWorldPoint, setRawClickWorldPoint] = useState<THREE.Vector3 | null>(null)
  const clickWorldPoint = activeToolMode === 'view' && selectionMode === 'face' ? rawClickWorldPoint : null
  const [displayMode, setDisplayMode] = useState<DisplayMode>('solid')
  const [debugSelectedFaceRow, setDebugSelectedFaceRow] = useState<number | null>(null)
  const [debugSelectedEdgeRow, setDebugSelectedEdgeRow] = useState<number | null>(null)

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode)
    if (mode !== 'debug') {
      setDebugSelectedFaceRow(null)
      setDebugSelectedEdgeRow(null)
    }
  }, [])

  const handleSnap = useCallback((candidate: SnapCandidate | null) => {
    setSnapCandidate(candidate)
  }, [])

  const handleClickWorldPoint = useCallback((point: THREE.Vector3 | null) => {
    setRawClickWorldPoint(point)
  }, [])

  // In point mode, snap drives the hover highlight instead of raycasting
  const snapHoveredId = useMemo(() => {
    if (selectionMode !== 'point' || !snapCandidate || !selectorRuntime) return null
    const ref = selectorRuntime.vertexReferenceByRowIndex.get(snapCandidate.referenceRowIndex)
    return ref?.id ?? null
  }, [selectionMode, snapCandidate, selectorRuntime])

  const effectiveHoveredId = selectionMode === 'point' ? snapHoveredId : hoveredReferenceId

  // Memoized geometry: single point at origin for the click-position dot
  const clickDotGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3))
    return geo
  }, [])

  // Circular texture for the click dot (avoids square PointsMaterial default)
  const clickDotTexture = useMemo(() => {
    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
    ctx.fillStyle = 'white'
    ctx.fill()
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [])

  // Clear selection when leaving view mode
  useEffect(() => {
    if (activeToolMode !== 'view') {
      useSelectionStore.getState().clearSelection()
    }
  }, [activeToolMode])

  // Expose selectorRuntime to window.__r3f_dev for integration tests
  useEffect(() => {
    const dev = window.__r3f_dev
    if (dev) dev.selectorRuntime = selectorRuntime
  }, [selectorRuntime])

  // Resolve selected reference for HUD
  const selectedReference = useMemo(() => {
    if (!selectedReferenceId || !selectorRuntime) return null
    return selectorRuntime.referenceMap.get(selectedReferenceId) ?? null
  }, [selectedReferenceId, selectorRuntime])

  const handleFaceClick = useCallback((face: string) => {
    const dir = FACE_DIRECTIONS[face]
    if (!dir) return

    const controls = controlsRef.current
    if (!controls) return

    const camera = controls.object as THREE.PerspectiveCamera
    const dist = camera.position.distanceTo(controls.target)
    const target = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize().multiplyScalar(dist)

    const isTop = dir[2] > 0.99
    const isBottom = dir[2] < -0.99
    const targetUp = isTop
      ? new THREE.Vector3(0, 1, 0)
      : isBottom
        ? new THREE.Vector3(0, -1, 0)
        : new THREE.Vector3(0, 0, 1)

    setAnimTarget(target)
    setAnimTargetUp(targetUp)
    setAnimActive(true)
  }, [])

  const handleAnimDone = useCallback(() => {
    setAnimActive(false)
    setAnimTarget(null)
    setAnimTargetUp(null)
  }, [])

  const handleModelError = useCallback((msg: string) => {
    console.error('[ViewportContainer] model load error:', msg)
    toast.error(msg)
  }, [])

  const applyCameraFit = useCallback((box: THREE.Box3, controls: OrbitControlsImpl) => {
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim === 0) return

    const camera = controls.object as THREE.PerspectiveCamera
    const fitDist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))
    // Ensure the camera stays at least 10× the near plane away to avoid
    // clipping tiny models (e.g. a 3cm box in meter units = 0.03 units).
    const dist = Math.max(fitDist / 0.5, camera.near * 10)
    const pos = center.clone().add(new THREE.Vector3(dist * 0.7, -dist * 0.7, dist * 0.6))

    setAnimTarget(pos)
    setAnimTargetUp(new THREE.Vector3(0, 0, 1))
    setAnimActive(true)
    controls.target.copy(center)
    controls.update()
  }, [])

  const handleModelLoaded = useCallback((box: THREE.Box3) => {
    const controls = controlsRef.current
    if (!controls) {
      pendingBoxRef.current = box.clone()
      return
    }
    pendingBoxRef.current = null
    applyCameraFit(box, controls)
  }, [applyCameraFit])

  // Apply pending camera fit once OrbitControls ref is available
  useEffect(() => {
    const controls = controlsRef.current
    const box = pendingBoxRef.current
    if (!controls || !box) return
    pendingBoxRef.current = null
    applyCameraFit(box, controls)
  }, [applyCameraFit, modelBuffer])

  const handleResetCamera = useCallback(() => {
    const controls = controlsRef.current
    const modelGroup = modelGroupRef.current
    if (!controls) return

    // Recompute bounding box from current model state to handle scale transforms
    if (modelGroup) {
      const box = new THREE.Box3()
      modelGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.visible) {
          const geo = child.geometry
          if (geo?.boundingBox) {
            const worldBox = geo.boundingBox.clone()
            worldBox.applyMatrix4(child.matrixWorld)
            box.union(worldBox)
          } else {
            // Fallback: compute from geometry attributes
            const pos = geo.getAttribute('position')
            if (pos) {
              const tempBox = new THREE.Box3().setFromBufferAttribute(pos)
              tempBox.applyMatrix4(child.matrixWorld)
              box.union(tempBox)
            }
          }
        }
      })
      if (!box.isEmpty()) {
        applyCameraFit(box, controls)
        return
      }
    }

    // Fallback: if no model loaded, use default view
    const defaultPos = new THREE.Vector3(5, -5, 3)
    const defaultUp = new THREE.Vector3(0, 0, 1)
    setAnimTarget(defaultPos)
    setAnimTargetUp(defaultUp)
    setAnimActive(true)
    controls.target.set(0, 0, 0)
    controls.update()
  }, [applyCameraFit])

  const handleDragRotate = useCallback((deltaX: number, deltaY: number) => {
    const controls = controlsRef.current
    if (!controls) return
    // Use rotateLeft/rotateRight from OrbitControls internal API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(controls as any).rotateLeft?.(deltaX * 0.01)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(controls as any).rotateUp?.(deltaY * 0.01)
    controls.update()
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        style={{ width: '100%', height: '100%', background: canvasBackground }}
        scene={{ up: [0, 0, 1] as unknown as THREE.Vector3 }}
        camera={{ fov: 50, near: 0.001, far: 10000, position: [5, -5, 3], up: [0, 0, 1] as [number, number, number] }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        onCreated={({ camera, scene, gl }) => {
          useEngineStore.getState().setEngineObjects({ camera, scene, gl })
          if (import.meta.env.DEV) {
            window.__r3f_dev = { camera, scene, gl }
          }
        }}
      >
        <OrbitControls ref={controlsRef} enableDamping enabled={activeToolMode === 'view' && !animActive} />
        <CameraAnimator
          targetPos={animTarget}
          targetUp={animTargetUp}
          controlsRef={controlsRef}
          active={animActive}
          onDone={handleAnimDone}
        />
        <SceneSetup />
        <ModelTransformTracker modelRef={modelGroupRef} />
        <ModelGroup
          ref={modelGroupRef}
          buffer={modelBuffer}
          format={modelFormat}
          onLoaded={handleModelLoaded}
          onError={handleModelError}
          selectorRuntime={selectorRuntime}
          displayMode={displayMode}
        />
        <ToolOverlay modelRef={modelGroupRef} />
        {hasTopology && <TopologyOverlay selectorRuntime={selectorRuntime} />}
        {(displayMode === 'wireframe' || displayMode === 'solidWithMesh' || displayMode === 'debug') && hasTopology && (
          <DebugTopologyOverlay selectorRuntime={selectorRuntime!} centeringOffset={centeringOffset} showVertices={displayMode === 'debug'} />
        )}
        <TopologyPicker
          enabled={activeToolMode === 'view'}
          selectionMode={selectionMode}
          selectorRuntime={selectorRuntime}
          modelGroupRef={modelGroupRef}
          onHover={setHoveredReference}
          onClick={setSelectedReference}
          onSnap={handleSnap}
          onClickWorldPoint={handleClickWorldPoint}
        />
        <SelectionHighlight
          runtime={selectorRuntime}
          referenceId={effectiveHoveredId}
          color="#ffffff"
          opacity={0.25}
          modelGroupRef={modelGroupRef}
          renderOrder={displayMode === 'wireframe' ? 4 : 2}
        />
        <SelectionHighlight
          runtime={selectorRuntime}
          referenceId={selectedReferenceId}
          color="#2563eb"
          opacity={displayMode === 'wireframe' ? 0.8 : 0.5}
          modelGroupRef={modelGroupRef}
          renderOrder={displayMode === 'wireframe' ? 5 : 2}
        />
        {clickWorldPoint && selectionMode === 'face' && (
          <points
            position={clickWorldPoint}
            geometry={clickDotGeo}
            frustumCulled={false}
            renderOrder={3}
          >
            <pointsMaterial
              color="red"
              size={5}
              sizeAttenuation={false}
              map={clickDotTexture}
              depthTest
              depthWrite={false}
              toneMapped={false}
            />
          </points>
        )}
      </Canvas>

      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 8,
          zIndex: 10,
        }}
      >
        <SelectionToolbar hasTopology={hasTopology} />
        <DisplayModeDropdown displayMode={displayMode} onChange={handleDisplayModeChange} hasTopology={hasTopology} />
        {displayMode === 'debug' && selectorRuntime && (
          <>
            <select
              value={debugSelectedFaceRow ?? ''}
              onChange={(e) => {
                const row = e.target.value !== '' ? Number(e.target.value) : null
                setDebugSelectedFaceRow(row)
                if (row != null && selectorRuntime) {
                  const ref = selectorRuntime.faceReferenceByRowIndex.get(row)
                  if (ref) useSelectionStore.getState().setSelectedReference(ref.id)
                } else {
                  useSelectionStore.getState().setSelectedReference(null)
                }
              }}
              style={{
                background: 'transparent',
                color: '#aaa',
                border: 'none',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">{t('debug.selectFace')}</option>
              {selectorRuntime.faces.map((f, i) => (
                <option key={i} value={i}>{f.id} {f.surfaceType}</option>
              ))}
            </select>
            <select
              value={debugSelectedEdgeRow ?? ''}
              onChange={(e) => {
                const row = e.target.value !== '' ? Number(e.target.value) : null
                setDebugSelectedEdgeRow(row)
                if (row != null && selectorRuntime) {
                  const ref = selectorRuntime.edgeReferenceByRowIndex.get(row)
                  if (ref) useSelectionStore.getState().setSelectedReference(ref.id)
                } else {
                  useSelectionStore.getState().setSelectedReference(null)
                }
              }}
              style={{
                background: 'transparent',
                color: '#aaa',
                border: 'none',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">{t('debug.selectEdge')}</option>
              {selectorRuntime.edges.map((e, i) => (
                <option key={i} value={i}>{e.id} {e.curveType}</option>
              ))}
            </select>
          </>
        )}
      </div>
      <SelectionInfoOverlay reference={selectedReference} />

      <AxesIndicator mainCamera={mainCamera} />
      <ViewCube mainCamera={mainCamera} onFaceClick={handleFaceClick} onReset={handleResetCamera} onDragRotate={handleDragRotate} />
    </div>
  )
}
