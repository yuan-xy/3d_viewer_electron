import { useEffect, useRef, useState, forwardRef } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { mergeGeometries as mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useModelStore, type GlbPartInfo } from '@/stores/model-store'
import type { SelectorRuntime } from '@/lib/topology/types'
import { buildGlbFaceIdsForPart } from '@/lib/topology/build-face-ids'
import type { DisplayMode } from './DisplayModeDropdown'

// ---- types ----

interface ModelGroupProps {
  buffer: ArrayBuffer | null
  format: 'stl' | 'glb' | '3mf' | 'step' | 'stp' | null
  onLoaded?: (box: THREE.Box3) => void
  onError?: (message: string) => void
  /** If provided, faceIds are built and attached to each GLB mesh's userData for face picking */
  selectorRuntime?: SelectorRuntime | null
  displayMode?: DisplayMode
}

// ---- helpers ----

function mergeGeometries(meshes: THREE.Mesh[]): THREE.BufferGeometry {
  const geoms = meshes.map((m) => {
    const g = m.geometry.clone()
    g.applyMatrix4(m.matrixWorld)
    return g
  })
  if (geoms.length === 0) return new THREE.BufferGeometry()
  if (geoms.length === 1) return geoms[0]
  return mergeBufferGeometries(geoms, false)
}

// ----

const ModelGroup = forwardRef<THREE.Group, ModelGroupProps>(function ModelGroup(
  { buffer, format, onLoaded, onError, selectorRuntime, displayMode = 'solid' },
  ref,
) {
  // GLB: render individual meshes
  const [glbMeshes, setGlbMeshes] = useState<THREE.Mesh[]>([])
  // Non-GLB: single merged geometry
  const [mergedGeometry, setMergedGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const setGlbPartInfos = useModelStore((s) => s.setGlbPartInfos)
  const setModelCenteringOffset = useModelStore((s) => s.setModelCenteringOffset)
  const glbPartInfos = useModelStore((s) => s.glbPartInfos)
  const updateSceneTree = useModelStore((s) => s.updateSceneTree)

  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    if (!buffer || !format) {
      setGlbMeshes([])
      setMergedGeometry(null)
      setError(null)
      setGlbPartInfos([])
      setModelCenteringOffset(null)
      updateSceneTree([])
      return
    }

    let cancelled = false

    async function load() {
      try {
        if (format === 'stl') {
          const geo = new STLLoader().parse(buffer!)
          if (cancelled) return
          geo.computeVertexNormals()
          geo.center()
          setMergedGeometry(geo)
          setGlbMeshes([])
          setGlbPartInfos([])
          updateSceneTree([{ id: 'stl-model', name: 'STL Model', visible: true }])
          geo.computeBoundingBox()
          if (geo.boundingBox) onLoadedRef.current?.(geo.boundingBox.clone())
        } else if (format === 'glb') {
          const loader = new GLTFLoader()
          const gltf = await loader.parseAsync(buffer!, '')
          if (cancelled) return

          // GLBs from cad-skill's STEP pipeline carry STEP_topology extension
          // and store Z-up mesh data directly. Standard GLBs are Y-up per
          // glTF spec — rotate them into our Z-up scene.
          const gltfJson = (gltf as unknown as { parser?: { json?: { extensions?: Record<string, unknown> } } }).parser?.json
          const isCadSkillGlb = !!gltfJson?.extensions?.['STEP_topology']
          if (!isCadSkillGlb) {
            console.log('[ModelGroup] standard Y-up GLB detected — converting to Z-up')
          }

          const rawMeshes: THREE.Mesh[] = []
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) rawMeshes.push(child)
          })
          if (rawMeshes.length === 0) {
            const msg = 'No meshes found in GLB'
            setError(msg)
            onErrorRef.current?.(msg)
            return
          }

          // Compute overall bounding box in world space
          const overallBox = new THREE.Box3()
          const processed: THREE.Mesh[] = []
          const partInfos: GlbPartInfo[] = []

          for (let i = 0; i < rawMeshes.length; i++) {
            const src = rawMeshes[i]
            const geo = src.geometry.clone()
            src.updateWorldMatrix(true, false)
            geo.applyMatrix4(src.matrixWorld)
            if (!isCadSkillGlb) {
              geo.rotateX(-Math.PI / 2)
            }
            geo.computeVertexNormals()
            geo.computeBoundingBox()

            if (geo.boundingBox) {
              overallBox.expandByObject(
                new THREE.Mesh(geo),
              )
            }

            const partId = src.userData?.partId ||
              src.name ||
              `part-${i}`

            processed.push(new THREE.Mesh(geo))
            partInfos.push({
              partId: String(partId),
              meshIndex: i,
              name: src.name || `part-${i}`,
              triangleCount: geo.index
                ? geo.index.count / 3
                : geo.attributes.position?.count / 3 || 0,
            })
          }

          // Center the group
          const center = overallBox.getCenter(new THREE.Vector3())
          for (const mesh of processed) {
            mesh.position.copy(center).multiplyScalar(-1)
          }

          setModelCenteringOffset([center.x, center.y, center.z])

          setMergedGeometry(null)
          setGlbMeshes(processed)
          setGlbPartInfos(partInfos)

          // Build scene tree from part infos (GLB only)
          const sceneTree = partInfos.map((info) => ({
            id: info.partId,
            name: info.name,
            visible: true,
          }))
          updateSceneTree(sceneTree)

          const finalBox = new THREE.Box3()
          for (const mesh of processed) {
            const clone = mesh.geometry.clone()
            clone.translate(mesh.position.x, mesh.position.y, mesh.position.z)
            finalBox.expandByObject(new THREE.Mesh(clone))
          }
          onLoadedRef.current?.(finalBox)
        } else if (format === '3mf') {
          const group = new ThreeMFLoader().parse(buffer!)
          if (cancelled) return

          const rawMeshes: THREE.Mesh[] = []
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) rawMeshes.push(child)
          })
          if (rawMeshes.length === 0) {
            const msg = 'No meshes found in 3MF'
            setError(msg)
            onErrorRef.current?.(msg)
            return
          }

          const geo = mergeGeometries(rawMeshes)
          geo.computeVertexNormals()
          geo.center()
          setMergedGeometry(geo)
          setGlbMeshes([])
          setGlbPartInfos([])

          // Build scene tree from 3MF objects (3MF can have multiple objects)
          const sceneTree: { id: string; name: string; visible: boolean }[] = []
          let objIdx = 0
          group.traverse((child) => {
            if (child instanceof THREE.Object3D) {
              const name = child.name || `object-${objIdx}`
              sceneTree.push({ id: String(objIdx), name, visible: true })
              objIdx++
            }
          })
          updateSceneTree(sceneTree)
          geo.computeBoundingBox()
          if (geo.boundingBox) onLoadedRef.current?.(geo.boundingBox.clone())
        } else if (format === 'step' || format === 'stp') {
          setMergedGeometry(new THREE.BoxGeometry(0.3, 0.3, 0.3))
          setGlbMeshes([])
          setGlbPartInfos([])
        } else {
          const msg = `Unsupported format: ${format}`
          setError(msg)
          onErrorRef.current?.(msg)
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('[ModelGroup] load error:', msg)
          setError(msg)
          onErrorRef.current?.(msg)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, format, setGlbPartInfos, setModelCenteringOffset])

  if (error) {
    return null
  }

  const isPlaceholder = format === 'step' || format === 'stp'

  // GLB: render individual meshes
  if (glbMeshes.length > 0) {
    // Build faceIds for each mesh if runtime is available
    const meshFaceIds: (Uint32Array | null)[] = []
    if (selectorRuntime) {
      const occurrenceRows = selectorRuntime.occurrenceIdByRowIndex
      const singleOccurrenceId = selectorRuntime.singleOccurrenceId
      for (let i = 0; i < glbMeshes.length; i++) {
        const info = glbPartInfos[i]
        const occurrenceId = singleOccurrenceId ||
          (Array.from(occurrenceRows.values())[i] ?? '')
        const faceIds = buildGlbFaceIdsForPart(
          {
            occurrenceId,
            primitiveIndex: info?.meshIndex ?? i,
            triangleCount: info?.triangleCount ?? 0,
          },
          selectorRuntime,
        )
        meshFaceIds.push(faceIds)
      }
      console.log('[ModelGroup] faceIds built:', meshFaceIds.map(
        (f, i) => `mesh${i}:${f ? f.length + 'triangles,' + f.filter((v: number) => v !== 0xffffffff).length + 'mapped' : 'null'}`))
    }

    const isMeshOnly = displayMode === 'mesh' || displayMode === 'debug'
    const isSolidMesh = displayMode === 'solidWithMesh'

    // wireframe mode: render invisible meshes for face raycasting only.
    // Wireframe edges are drawn by DebugTopologyOverlay; these meshes
    // are invisible (colorWrite=false) but still intersectable by the
    // raycaster so face picking works.
    if (displayMode === 'wireframe') {
      return (
        <group ref={ref as unknown as React.Ref<THREE.Group>}>
          {glbMeshes.map((mesh, i) => (
            <mesh
              key={i}
              geometry={mesh.geometry}
              position={mesh.position}
              userData={{
                partId: glbPartInfos[i]?.partId || `part-${i}`,
                meshIndex: i,
                faceIds: meshFaceIds[i] || undefined,
              }}
            >
              <meshBasicMaterial
                color="#cccccc"
                transparent
                opacity={0}
                depthWrite={false}
                colorWrite={false}
              />
            </mesh>
          ))}
        </group>
      )
    }

    return (
      <group ref={ref as unknown as React.Ref<THREE.Group>}>
        {glbMeshes.map((mesh, i) => (
          <mesh
            key={i}
            geometry={mesh.geometry}
            position={mesh.position}
            userData={{
              partId: glbPartInfos[i]?.partId || `part-${i}`,
              meshIndex: i,
              faceIds: meshFaceIds[i] || undefined,
            }}
          >
            <meshStandardMaterial
              color="#cccccc"
              roughness={0.4}
              metalness={0.1}
              wireframe={isMeshOnly}
              polygonOffset={isSolidMesh}
              polygonOffsetFactor={isSolidMesh ? 1 : 0}
              polygonOffsetUnits={isSolidMesh ? 1 : 0}
            />
          </mesh>
        ))}
        {isSolidMesh && glbMeshes.map((mesh, i) => (
          <mesh
            key={`wf-${i}`}
            geometry={mesh.geometry}
            position={mesh.position}
          >
            <meshBasicMaterial
              color="#222222"
              wireframe
              depthTest
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    )
  }

  // Non-GLB or placeholder: single merged mesh
  if (!mergedGeometry) return null

  const isMeshOnly = displayMode === 'mesh' || displayMode === 'debug'
  const isSolidMesh = displayMode === 'solidWithMesh'

  // wireframe mode: render invisible mesh for face raycasting only
  if (displayMode === 'wireframe') {
    return (
      <group ref={ref as unknown as React.Ref<THREE.Group>}>
        <mesh geometry={mergedGeometry}>
          <meshBasicMaterial
            color={isPlaceholder ? '#4488ff' : '#cccccc'}
            transparent
            opacity={0}
            depthWrite={false}
            colorWrite={false}
          />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={ref as unknown as React.Ref<THREE.Group>}>
      <mesh geometry={mergedGeometry}>
        <meshStandardMaterial
          color={isPlaceholder ? '#4488ff' : '#cccccc'}
          roughness={isPlaceholder ? 0.6 : 0.4}
          metalness={isPlaceholder ? 0.3 : 0.1}
          wireframe={isPlaceholder || isMeshOnly}
          polygonOffset={isSolidMesh}
          polygonOffsetFactor={isSolidMesh ? 1 : 0}
          polygonOffsetUnits={isSolidMesh ? 1 : 0}
        />
      </mesh>
      {isSolidMesh && !isPlaceholder && (
        <mesh geometry={mergedGeometry}>
          <meshBasicMaterial
            color="#222222"
            wireframe
            depthTest
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
})

export default ModelGroup
