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
import ToolOverlay from '@/engine/components/ToolOverlay'
import TopologyPicker from '@/engine/components/TopologyPicker'
import { toast } from 'sonner'

/** Triggers CameraAnimator when the user toggles up-axis. The animation rotates
 *  the camera around the world X axis so the model appears stationary while the
 *  "up" direction smoothly transitions. Does NOT touch the model at all. */
function UpAxisAnimator({
  upAxis,
  animActive,
  setAnimTarget,
  setAnimTargetUp,
  setAnimActive,
}: {
  upAxis: 'y' | 'z'
  animActive: boolean
  setAnimTarget: (pos: THREE.Vector3 | null) => void
  setAnimTargetUp: (up: THREE.Vector3 | null) => void
  setAnimActive: (active: boolean) => void
}) {
  const { camera } = useThree()
  const prevUpAxis = useRef(upAxis)

  useEffect(() => {
    if (prevUpAxis.current === upAxis) return
    // Wait for any in-progress animation to finish before starting a new one
    if (animActive) return

    const targetUp = upAxis === 'y'
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1)

    if (camera.up.clone().normalize().distanceTo(targetUp) < 0.001) {
      prevUpAxis.current = upAxis
      return
    }

    prevUpAxis.current = upAxis

    // Rotate camera position around world X axis through origin.
    // Z-up → Y-up: -π/2 around X.  Y-up → Z-up: +π/2 around X.
    const currentUp = camera.up.clone().normalize()
    const isCurrentlyYUp = Math.abs(currentUp.y - 1) < 0.01
    const angle = isCurrentlyYUp ? Math.PI / 2 : -Math.PI / 2
    const targetPos = camera.position.clone().applyAxisAngle(
      new THREE.Vector3(1, 0, 0), angle,
    )

    setAnimTarget(targetPos)
    setAnimTargetUp(targetUp)
    setAnimActive(true)
  }, [upAxis, animActive, camera, setAnimTarget, setAnimTargetUp, setAnimActive])

  return null
}

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

function CameraModeSwitcher() {
  const cameraMode = useUIStore((s) => s.cameraMode)
  const { camera, set: setThree, size, controls } = useThree()

  useEffect(() => {
    const aspect = size.width / size.height
    const orbitControls = controls as OrbitControlsImpl | null
    const target = orbitControls?.target ?? new THREE.Vector3(0, 0, 0)

    if (cameraMode === 'perspective' && !(camera instanceof THREE.PerspectiveCamera)) {
      const pos = camera.position.clone()
      const up = camera.up.clone()
      const near = camera.near
      const far = camera.far

      const orthoCam = camera as THREE.OrthographicCamera
      const zoom = orthoCam.zoom || 1
      const effectiveHalfHeight = orthoCam.top / zoom
      const dist = effectiveHalfHeight / Math.tan(THREE.MathUtils.degToRad(25))

      const perspCam = new THREE.PerspectiveCamera(50, aspect, near, far)
      const viewDir = pos.clone().sub(target).normalize()
      perspCam.position.copy(target).addScaledVector(viewDir, dist)
      perspCam.up.copy(up)
      perspCam.lookAt(target)
      setThree({ camera: perspCam })
    } else if (cameraMode === 'orthographic' && !(camera instanceof THREE.OrthographicCamera)) {
      const pos = camera.position.clone()
      const up = camera.up.clone()
      const near = camera.near
      const far = camera.far

      const dist = pos.distanceTo(target)
      const halfHeight = dist * Math.tan(THREE.MathUtils.degToRad(25))

      const orthoCam = new THREE.OrthographicCamera(
        -halfHeight * aspect, halfHeight * aspect,
        halfHeight, -halfHeight,
        near, far,
      )
      orthoCam.position.copy(pos)
      orthoCam.up.copy(up)
      orthoCam.lookAt(target)
      setThree({ camera: orthoCam })
    }
  }, [cameraMode, camera, setThree, size, controls])

  return null
}

export default function ViewportContainer() {
  const { t } = useTranslation()
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const modelGroupRef = useRef<THREE.Group>(null)
  const mainCamera = useEngineStore((s) => s.camera)
  const modelBuffer = useModelStore((s) => s.modelBuffer)
  const modelFormat = useModelStore((s) => s.modelFormat)
  const activeUpAxis = useModelStore((s) => s.activeUpAxis)

  const activeToolMode = useToolStore((s) => s.activeToolMode)
  const centeringOffset = useModelStore((s) => s.modelCenteringOffset)
  const theme = useUIStore((s) => s.theme)

  const canvasBackground = useMemo(() => {
    const isDark = theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : theme === 'dark'
    return isDark ? '#1a1a2e' : '#EEF3F5'
  }, [theme])

  const [animTarget, setAnimTarget] = useState<THREE.Vector3 | null>(null)
  const [animTargetUp, setAnimTargetUp] = useState<THREE.Vector3 | null>(null)
  const [animActive, setAnimActive] = useState(false)
  const pendingBoxRef = useRef<THREE.Box3 | null>(null)

  // Topology selection state — only available for GLB (not glTF, which
  // doesn't support embedded STEP_T extensions)
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
  const hasEdges = hasTopology && selectorRuntime.edges.length > 0
  const selectionMode = useToolStore((s) => s.selectionMode)
  const hoveredReferenceId = useSelectionStore((s) => s.hoveredReferenceId)
  const selectedReferenceIds = useSelectionStore((s) => s.selectedReferenceIds)
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

  // Ensure the dropdown value is always valid (wireframe options hidden when !hasEdges)
  const resolvedDisplayMode: DisplayMode = !hasEdges && (displayMode === 'wireframe' || displayMode === 'solidWithWireframe')
    ? 'solid'
    : displayMode

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

  // Resolve first selected reference for HUD
  const selectedReference = useMemo(() => {
    const id = selectedReferenceIds[0]
    if (!id || !selectorRuntime) return null
    return selectorRuntime.referenceMap.get(id) ?? null
  }, [selectedReferenceIds, selectorRuntime])

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

    const camera = controls.object
    let dist: number
    if (camera instanceof THREE.PerspectiveCamera) {
      const fitDist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))
      dist = Math.max(fitDist / 0.5, camera.near * 10)
    } else {
      dist = maxDim * 1.5
    }
    const pos = center.clone().add(new THREE.Vector3(dist * 0.7, -dist * 0.7, dist * 0.6))

    setAnimTarget(pos)
    setAnimTargetUp(activeUpAxis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1))
    setAnimActive(true)
    controls.target.copy(center)
    controls.update()
  }, [activeUpAxis])

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

  const _handleResetCamera = useCallback(() => {
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
    const defaultUp = activeUpAxis === 'y'
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1)
    setAnimTarget(defaultPos)
    setAnimTargetUp(defaultUp)
    setAnimActive(true)
    controls.target.set(0, 0, 0)
    controls.update()
  }, [applyCameraFit])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        style={{ width: '100%', height: '100%', background: canvasBackground }}
        scene={{ up: [0, 0, 1] as unknown as THREE.Vector3 }}
        camera={{ fov: 50, near: 0.001, far: 10000, position: [5, -5, 3], up: [0, 0, 1] as [number, number, number] }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
        onCreated={({ camera, scene, gl }) => {
          useEngineStore.getState().setEngineObjects({ camera, scene, gl })
          window.__r3f_dev = { camera, scene, gl }
        }}
      >
        <OrbitControls ref={controlsRef} makeDefault enableDamping enabled={activeToolMode === 'view' && !animActive} />
        <UpAxisAnimator upAxis={activeUpAxis} animActive={animActive} setAnimTarget={setAnimTarget} setAnimTargetUp={setAnimTargetUp} setAnimActive={setAnimActive} />
        <CameraAnimator
          targetPos={animTarget}
          targetUp={animTargetUp}
          controlsRef={controlsRef}
          active={animActive}
          onDone={handleAnimDone}
        />
        <CameraModeSwitcher />
        <SceneSetup />
        <ModelTransformTracker modelRef={modelGroupRef} />
        <ModelGroup
          ref={modelGroupRef}
          buffer={modelBuffer}
          format={modelFormat}
          onLoaded={handleModelLoaded}
          onError={handleModelError}
          selectorRuntime={selectorRuntime}
          displayMode={resolvedDisplayMode}
        />
        <ToolOverlay modelRef={modelGroupRef} />
        {hasTopology && <TopologyOverlay selectorRuntime={selectorRuntime} />}
        {((resolvedDisplayMode === 'wireframe' || resolvedDisplayMode === 'solidWithWireframe') && hasEdges || resolvedDisplayMode === 'debug' && hasEdges) && (
          <DebugTopologyOverlay selectorRuntime={selectorRuntime!} centeringOffset={centeringOffset} showVertices={displayMode === 'debug'} />
        )}
        <TopologyPicker
          enabled={activeToolMode === 'view'}
          selectionMode={selectionMode}
          selectorRuntime={selectorRuntime}
          modelGroupRef={modelGroupRef}
          onHover={setHoveredReference}
          onClick={(id, shiftKey) => setSelectedReference(id, { shiftKey })}
          onSnap={handleSnap}
          onClickWorldPoint={handleClickWorldPoint}
        />
        <SelectionHighlight
          runtime={selectorRuntime}
          referenceId={effectiveHoveredId}
          color="#ffffff"
          opacity={0.25}
          modelGroupRef={modelGroupRef}
          renderOrder={resolvedDisplayMode === 'wireframe' ? 4 : 2}
        />
        {selectedReferenceIds.map((id) => (
          <SelectionHighlight
            key={id}
            runtime={selectorRuntime}
            referenceId={id}
            color="#2563eb"
            opacity={resolvedDisplayMode === 'wireframe' ? 0.8 : 0.5}
            modelGroupRef={modelGroupRef}
            renderOrder={resolvedDisplayMode === 'wireframe' ? 5 : 2}
          />
        ))}
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
          left: 16,
          display: 'flex',
          gap: 8,
          zIndex: 10,
        }}
      >
        <SelectionToolbar hasTopology={hasTopology} hasEdges={hasEdges} />
        <DisplayModeDropdown displayMode={resolvedDisplayMode} onChange={handleDisplayModeChange} hasTopology={hasTopology} hasEdges={hasEdges} />
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
    </div>
  )
}
