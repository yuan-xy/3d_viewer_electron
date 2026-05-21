import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { SelectionMode } from '@/stores/tool-store'
import type { SelectorRuntime } from '@/lib/topology/types'
import {
  faceReferenceFromIntersection,
  edgeReferenceFromIntersection,
  pointReferenceFromIntersection,
  partIdFromIntersection,
} from '@/lib/topology/picking'
import { findClosestPoint, type SnapCandidate } from '@/lib/topology/snap'
import { useModelStore } from '@/stores/model-store'

function snapRadiusPx(canvas: HTMLCanvasElement): number {
  return Math.min(canvas.clientWidth, canvas.clientHeight) * 0.12
}

interface UseTopologyPickingOptions {
  /** Whether picking is active (only when toolMode === 'view') */
  enabled: boolean
  /** Current selection sub-mode */
  selectionMode: SelectionMode
  /** Built selector runtime (null if no topology data) */
  selectorRuntime: SelectorRuntime | null
  /** Ref to the model group (contains display meshes for raycasting) */
  modelGroupRef: React.RefObject<THREE.Group | null>
  /** Called on hover with the reference id (or null when hovering nothing) */
  onHover: (referenceId: string | null) => void
  /** Called on click with the reference id (null = empty space) and whether shift was held */
  onClick: (referenceId: string | null, shiftKey?: boolean) => void
  /** Called with the world-space intersection point on face click */
  onClickWorldPoint?: (point: THREE.Vector3 | null) => void
  /** Called when a snap candidate is found in point mode (null = no snap) */
  onSnap?: (candidate: SnapCandidate | null) => void
}

const HOVER_MIN_MOVE_PX = 2

/** Compute an appropriate edge line-picking threshold from model size.
 *  Using a fixed large threshold causes the raycaster to hit edges far
 *  from the pointer on tiny models, returning whichever is first along
 *  the ray rather than the one under the cursor. */
function edgeThreshold(bboxSize: number): number {
  // 2% of model diagonal, clamped to [1mm, 2cm] for usable hit targets
  return Math.max(0.001, Math.min(0.02, bboxSize * 0.02))
}

/** Compute an appropriate point-picking threshold from model size.
 *  Same principle as edgeThreshold — a fixed 1.5m threshold hits every
 *  point on small models, always returning the camera-closest one. */
function pointThreshold(bboxSize: number): number {
  return Math.max(0.001, Math.min(0.02, bboxSize * 0.02))
}

/**
 * Collects all visible display meshes from the model group.
 * These are the meshes that were rendered by ModelGroup for GLB files.
 */
function collectDisplayMeshes(group: THREE.Group | null): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  if (!group) return meshes

  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.visible) {
      meshes.push(child)
    }
  })
  return meshes
}

/**
 * Hook that attaches pointer events to the R3F canvas and dispatches
 * picking queries based on the active SelectionMode.
 */
export function useTopologyPicking({
  enabled,
  selectionMode,
  selectorRuntime,
  modelGroupRef,
  onHover,
  onClick,
  onClickWorldPoint,
  onSnap,
}: UseTopologyPickingOptions) {
  const { camera, gl, scene } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  // Stable refs for the callbacks so the effect doesn't re-run on every render
  const onHoverRef = useRef(onHover)
  const onClickRef = useRef(onClick)
  const onClickPointRef = useRef(onClickWorldPoint)
  const onSnapRef = useRef(onSnap)
  const selectionModeRef = useRef(selectionMode)
  const selectorRuntimeRef = useRef(selectorRuntime)
  const currentSnapRef = useRef<SnapCandidate | null>(null)
  const lastHitPointRef = useRef<THREE.Vector3 | null>(null)

  useEffect(() => {
    onHoverRef.current = onHover
    onClickRef.current = onClick
    onClickPointRef.current = onClickWorldPoint
    onSnapRef.current = onSnap
    selectionModeRef.current = selectionMode
    selectorRuntimeRef.current = selectorRuntime
  })

  useEffect(() => {
    if (!enabled) return

    const canvas = gl.domElement
    const pointer = new THREE.Vector2()
    const pointerDown = { active: false, x: 0, y: 0 }
    const hoverState = { rafId: 0, x: 0, y: 0, lastX: NaN, lastY: NaN, hoveredId: '' }

    function setPointerFromClient(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    }

    function pick(clientX: number, clientY: number): string | null {
      const runtime = selectorRuntimeRef.current
      const mode = selectionModeRef.current
      setPointerFromClient(clientX, clientY)
      raycaster.setFromCamera(pointer, camera)

      // Find the pick-overlay group in the scene
      const pickOverlay = scene.getObjectByName('topology-pick-overlay') as THREE.Group | undefined

      // Collect display meshes
      const displayMeshes = collectDisplayMeshes(modelGroupRef.current)

      if (mode === 'object') {
        if (!displayMeshes.length) return null
        const hits = raycaster.intersectObjects(displayMeshes, false)
        if (!hits.length) return null
        const result = partIdFromIntersection({ object: hits[0].object })
        if (result) console.log('[pick] object mode hit:', result)
        return result ?? null
      }

      if (!runtime) return null

      if (mode === 'face') {
        // PRIMARY PATH: hit visible display meshes (ModelGroup output).
        // These carry per-part faceIds built by buildGlbFaceIdsForPart().
        // Used in normal display modes (solid, mesh, debug).
        if (displayMeshes.length) {
          const hits = raycaster.intersectObjects(displayMeshes, false)
          if (hits.length) {
            const hasFaceIds = !!(hits[0].object.userData?.faceIds)
            console.log('[pick] face mode: display mesh hit, faceIndex:', hits[0].faceIndex,
              'hasFaceIds:', hasFaceIds,
              'faceIdsLength:', (hits[0].object.userData?.faceIds as Uint32Array)?.length)
          }
          for (const hit of hits) {
            const ref = faceReferenceFromIntersection(
              { faceIndex: hit.faceIndex, object: hit.object },
              runtime,
            )
            if (ref) {
              console.log('[pick] face mode: resolved reference', ref.id, ref.label)
              lastHitPointRef.current = hit.point.clone()
              return ref.id
            }
          }
        }
        // FALLBACK PATH: invisible face-pick-mesh built from raw STEP_T
        // extension data (see buildFacePickMesh). Used when display meshes
        // are absent — e.g. wireframe mode where ModelGroup returns null.
        const facePickMesh = pickOverlay?.getObjectByName('face-pick-mesh') as THREE.Mesh | undefined
        if (facePickMesh) {
          const hits = raycaster.intersectObject(facePickMesh, false)
          if (hits.length) console.log('[pick] face mode: facePickMesh hit, hits:', hits.length)
          for (const hit of hits) {
            const ref = faceReferenceFromIntersection(
              { faceIndex: hit.faceIndex, object: facePickMesh },
              runtime,
            )
            if (ref) {
              console.log('[pick] face mode (fallback): resolved reference', ref.id, ref.label)
              lastHitPointRef.current = hit.point.clone()
              return ref.id
            }
          }
        }
        return null
      }

      if (mode === 'edge') {
        const edgePickLines = pickOverlay?.getObjectByName('edge-pick-lines') as THREE.LineSegments | undefined
        if (!edgePickLines) {
          console.log('[pick] edge mode: no edgePickLines found in overlay')
          return null
        }
        const bbox = runtime.bbox
        const bboxSize = bbox
          ? Math.hypot(bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2])
          : 0.1
        raycaster.params.Line = { threshold: edgeThreshold(bboxSize) }
        const hits = raycaster.intersectObject(edgePickLines, false)
        console.log('[pick] edge mode: hits:', hits.length,
          'edgePickLines.vertices:', (edgePickLines.geometry?.attributes?.position as THREE.BufferAttribute)?.count)
        for (const hit of hits) {
          const ref = edgeReferenceFromIntersection(
            { index: hit.index, object: edgePickLines },
            runtime,
          )
          if (ref) {
            console.log('[pick] edge mode: resolved reference', ref.id, ref.label)
            return ref.id
          }
        }
        return null
      }

      if (mode === 'point') {
        const pointPickPoints = pickOverlay?.getObjectByName('point-pick-points') as THREE.Points | undefined
        if (!pointPickPoints) {
          console.log('[pick] point mode: no pointPickPoints found in overlay')
          return null
        }
        const bbox = runtime.bbox
        const bboxSize = bbox
          ? Math.hypot(bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2])
          : 0.1
        raycaster.params.Points = { threshold: pointThreshold(bboxSize) }
        const hits = raycaster.intersectObject(pointPickPoints, false)
        console.log('[pick] point mode: hits:', hits.length)
        for (const hit of hits) {
          const ref = pointReferenceFromIntersection(
            { index: hit.index, object: pointPickPoints },
            runtime,
          )
          if (ref) {
            console.log('[pick] point mode: resolved reference', ref.id, ref.label)
            return ref.id
          }
        }
        return null
      }

      return null
    }

    function flushHoverPick() {
      hoverState.rafId = 0
      hoverState.lastX = hoverState.x
      hoverState.lastY = hoverState.y
      const id = pick(hoverState.x, hoverState.y) || ''
      if (hoverState.hoveredId !== id) {
        hoverState.hoveredId = id
        onHoverRef.current(id || null)
      }
      updateSnap(hoverState.x, hoverState.y)
    }

    function scheduleHoverPick(clientX: number, clientY: number) {
      hoverState.x = clientX
      hoverState.y = clientY
      if (
        Number.isFinite(hoverState.lastX) &&
        Number.isFinite(hoverState.lastY) &&
        Math.hypot(clientX - hoverState.lastX, clientY - hoverState.lastY) < HOVER_MIN_MOVE_PX
      ) {
        return
      }
      if (hoverState.rafId) return
      hoverState.rafId = window.requestAnimationFrame(flushHoverPick)
    }

    function updateSnap(clientX: number, clientY: number) {
      const mode = selectionModeRef.current
      const runtime = selectorRuntimeRef.current
      if (mode !== 'point' || !runtime) {
        if (currentSnapRef.current) {
          currentSnapRef.current = null
          onSnapRef.current?.(null)
        }
        return
      }
      const centeringOffset = useModelStore.getState().modelCenteringOffset
      const snap = findClosestPoint(
        clientX, clientY, canvas, camera, runtime, snapRadiusPx(canvas), centeringOffset,
      )
      if (snap?.referenceRowIndex !== currentSnapRef.current?.referenceRowIndex ||
          snap?.pointType !== currentSnapRef.current?.pointType) {
        currentSnapRef.current = snap
        onSnapRef.current?.(snap)
      }
    }

    function clearHover() {
      if (hoverState.rafId) {
        cancelAnimationFrame(hoverState.rafId)
        hoverState.rafId = 0
      }
      hoverState.lastX = NaN
      hoverState.lastY = NaN
      if (!hoverState.hoveredId) return
      hoverState.hoveredId = ''
      onHoverRef.current(null)
    }

    function handlePointerMove(event: PointerEvent) {
      scheduleHoverPick(event.clientX, event.clientY)
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return
      pointerDown.active = true
      pointerDown.x = event.clientX
      pointerDown.y = event.clientY
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.button !== 0) return
      if (!pointerDown.active) return
      pointerDown.active = false
      const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
      if (moved > 4) return // ignore drags

      // In point mode, prefer the snap candidate over raycasting
      const snap = currentSnapRef.current
      if (selectionModeRef.current === 'point' && snap) {
        const ref = selectorRuntimeRef.current?.vertexReferenceByRowIndex.get(snap.referenceRowIndex)
        if (ref) {
          console.log('[TopologyPicker] click at', event.clientX, event.clientY,
            'mode: point (snapped), picked:', ref.id)
          onClickRef.current(ref.id, event.shiftKey)
          return
        }
      }

      lastHitPointRef.current = null
      const id = pick(event.clientX, event.clientY)
      console.log('[TopologyPicker] click at', event.clientX, event.clientY,
        'mode:', selectionModeRef.current,
        'picked:', id || 'null',
        'runtime:', !!selectorRuntimeRef.current,
        'displayMeshes:', collectDisplayMeshes(modelGroupRef.current).length)
      if (id) {
        onClickRef.current(id, event.shiftKey)
        if (selectionModeRef.current === 'face') {
          onClickPointRef.current?.(lastHitPointRef.current)
        }
      } else if (selectionModeRef.current === 'object' && !event.shiftKey) {
        // Clicking empty space in object mode deselects
        onClickRef.current(null)
      }
    }

    function handlePointerLeave() {
      clearHover()
      pointerDown.active = false
      if (currentSnapRef.current) {
        currentSnapRef.current = null
        onSnapRef.current?.(null)
      }
    }

    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      clearHover()
    }
  }, [enabled, camera, gl, scene, modelGroupRef, raycaster])
}
