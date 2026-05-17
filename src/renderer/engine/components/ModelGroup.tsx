import { useEffect, useRef, useState, forwardRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries as mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useModelStore, type GlbPartInfo } from '@/stores/model-store'
import type { SelectorRuntime } from '@/lib/topology/types'
import { buildGlbFaceIdsForPart } from '@/lib/topology/build-face-ids'
import type { DisplayMode } from './DisplayModeDropdown'
import { loadFormat } from '@/engine/formatLoaders'
import type { FormatId } from '@/config/file-formats'

// ---- types ----

interface ModelGroupProps {
  buffer: ArrayBuffer | null
  format: FormatId | null
  onLoaded?: (box: THREE.Box3) => void
  onError?: (message: string) => void
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

// ---- multi-mesh rendering constants ----
const MULTI_MESH_FORMATS: FormatId[] = ['glb', 'gltf', '3mf', 'fbx', 'dae', '3ds', 'usdz', 'vox', 'kmz', 'amf', 'lwo', 'md2', '3dm']

// ----

const ModelGroup = forwardRef<THREE.Group, ModelGroupProps>(function ModelGroup(
  { buffer, format, onLoaded, onError, selectorRuntime, displayMode = 'solid' },
  ref,
) {
  const [glbMeshes, setGlbMeshes] = useState<THREE.Mesh[]>([])
  const [mergedGeometry, setMergedGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [objects, setObjects] = useState<THREE.Object3D[]>([])
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
      setObjects([])
      setError(null)
      setGlbPartInfos([])
      setModelCenteringOffset(null)
      updateSceneTree([])
      return
    }

    let cancelled = false

    async function load() {
      try {
        // STEP is special — should have been converted to GLB already
        if (format === 'step') {
          console.warn('[ModelGroup] STEP received without prior conversion -- should be GLB by now')
          return
        }

        const result = await loadFormat(buffer, format)
        if (cancelled) return

        // If format produced non-mesh objects (GCode lines, BVH skeleton, PCD points, etc.)
        if (result.objects.length > 0 && result.meshes.length === 0) {
          setObjects(result.objects)
          setGlbMeshes([])
          setMergedGeometry(null)
          setGlbPartInfos([])
          updateSceneTree([{ id: `${format}-objects`, name: format.toUpperCase(), visible: true }])

          // Compute bounding box from all objects (Points, Lines, Bones, etc.)
          const box = new THREE.Box3()
          for (const obj of result.objects) {
            obj.updateWorldMatrix(true, false)
            if (obj.geometry) {
              if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox()
              if (obj.geometry.boundingBox) {
                box.expandByObject(obj)
              }
            }
          }
          if (!box.isEmpty()) onLoadedRef.current?.(box)
          return
        }

        const meshes = result.meshes
        if (meshes.length === 0) {
          const msg = 'No meshes found in file'
          setError(msg)
          onErrorRef.current?.(msg)
          return
        }

        // Determine whether to render as multi-mesh or single merged geometry
        const useMultiMesh = MULTI_MESH_FORMATS.includes(format)

        if (useMultiMesh) {
          // Multi-mesh path (GLB-like): keep individual meshes for face picking
          const overallBox = new THREE.Box3()
          const processed: THREE.Mesh[] = []
          const partInfos: GlbPartInfo[] = []

          for (let i = 0; i < meshes.length; i++) {
            const src = meshes[i]
            const geo = src.geometry.clone()
            src.updateWorldMatrix(true, false)
            geo.applyMatrix4(src.matrixWorld)

            // Standard GLTF/GLB is Y-up → convert to Z-up (unless cad-skill STEP GLB)
            if ((format === 'glb' || format === 'gltf') && !isCadSkillGlb(buffer)) {
              geo.rotateX(-Math.PI / 2)
            }

            geo.computeVertexNormals()
            geo.computeBoundingBox()

            if (geo.boundingBox) {
              overallBox.expandByObject(new THREE.Mesh(geo))
            }

            const partId = src.userData?.partId || src.name || `part-${i}`
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
          setObjects([])
          setGlbMeshes(processed)
          setGlbPartInfos(partInfos)

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
        } else {
          // Single merged geometry path (STL-like)
          const geo = mergeGeometries(meshes)
          geo.computeVertexNormals()
          geo.center()
          setMergedGeometry(geo)
          setGlbMeshes([])
          setObjects([])
          setGlbPartInfos([])
          updateSceneTree([{ id: `${format}-model`, name: format.toUpperCase(), visible: true }])
          geo.computeBoundingBox()
          if (geo.boundingBox) onLoadedRef.current?.(geo.boundingBox.clone())
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
    return () => { cancelled = true }
  }, [buffer, format, setGlbPartInfos, setModelCenteringOffset])

  if (error) {
    return null
  }

  // Render non-mesh objects (GCode lines, BVH skeleton helper, etc.)
  if (objects.length > 0) {
    return (
      <group ref={ref as unknown as React.Ref<THREE.Group>}>
        {objects.map((obj, i) => (
          <primitive key={i} object={obj} />
        ))}
      </group>
    )
  }

  // GLB-type: render individual meshes
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
        (f, i) => `mesh${i}:${f ? f.length + 'triangles,' + f.filter((v: number) => v !== 0xffffffff).length + 'mapped' : 'null'}`
      ))
    }

    const isMeshOnly = displayMode === 'mesh' || displayMode === 'debug'
    const isSolidMesh = displayMode === 'solidWithMesh'

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

  if (displayMode === 'wireframe') {
    return (
      <group ref={ref as unknown as React.Ref<THREE.Group>}>
        <mesh geometry={mergedGeometry}>
          <meshBasicMaterial
            color={'#cccccc'}
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
          color={'#cccccc'}
          roughness={0.4}
          metalness={0.1}
          wireframe={isMeshOnly}
          polygonOffset={isSolidMesh}
          polygonOffsetFactor={isSolidMesh ? 1 : 0}
          polygonOffsetUnits={isSolidMesh ? 1 : 0}
        />
      </mesh>
      {isSolidMesh && (
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

/** Detect if GLB was produced by cad-skill's STEP pipeline (has STEP_topology extension) */
function isCadSkillGlb(buffer: ArrayBuffer): boolean {
  try {
    // GLB header: magic(4) version(4) length(4), then JSON chunk
    const header = new Uint32Array(buffer.slice(0, 12))
    if (header[0] !== 0x46546C67) return false // 'glTF'
    // Skip to JSON chunk — rough check
    const view = new Uint8Array(buffer)
    // Look for STEP_topology string in buffer
    const decoder = new TextDecoder()
    const text = decoder.decode(view.slice(0, Math.min(view.length, 2048)))
    return text.includes('STEP_topology')
  } catch {
    return false
  }
}
