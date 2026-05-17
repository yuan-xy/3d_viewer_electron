import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js'
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js'
import { VTKLoader } from 'three/examples/jsm/loaders/VTKLoader.js'
import { XYZLoader } from 'three/examples/jsm/loaders/XYZLoader.js'
import { PDBLoader } from 'three/examples/jsm/loaders/PDBLoader.js'
import { NRRDLoader } from 'three/examples/jsm/loaders/NRRDLoader.js'
import { GCodeLoader } from 'three/examples/jsm/loaders/GCodeLoader.js'
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js'
import { VOXLoader } from 'three/examples/jsm/loaders/VOXLoader.js'
import { KMZLoader } from 'three/examples/jsm/loaders/KMZLoader.js'
import { AMFLoader } from 'three/examples/jsm/loaders/AMFLoader.js'
import { LWOLoader } from 'three/examples/jsm/loaders/LWOLoader.js'
import { MD2Loader } from 'three/examples/jsm/loaders/MD2Loader.js'
import { MDDLoader } from 'three/examples/jsm/loaders/MDDLoader.js'
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js'
import { LDrawLoader } from 'three/examples/jsm/loaders/LDrawLoader.js'
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js'
import type { FormatId } from '@/config/file-formats'

export interface LoaderResult {
  meshes: THREE.Mesh[]
  /** Non-mesh objects (lines, points, etc.) — rendered separately */
  objects: THREE.Object3D[]
  /** For skeleton-based formats (BVH) */
  skeleton?: THREE.Skeleton
}

function bufferToText(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder()
  return decoder.decode(buffer)
}

function extractMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  return meshes
}

function extractAllObjects(root: THREE.Object3D): THREE.Object3D[] {
  const objs: THREE.Object3D[] = []
  root.traverse((child) => {
    if (child !== root) objs.push(child)
  })
  return objs
}

/**
 * Central dispatcher: parse any supported format's ArrayBuffer into meshes/objects.
 * Returns { meshes, objects } ready for rendering.
 */
export async function loadFormat(buffer: ArrayBuffer, format: FormatId): Promise<LoaderResult> {
  switch (format) {
    // ---- already supported ----
    case 'stl': {
      const geo = new STLLoader().parse(buffer)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case 'glb':
    case 'gltf': {
      const gltf = await new GLTFLoader().parseAsync(buffer, '')
      const meshes = extractMeshes(gltf.scene)
      return { meshes, objects: [] }
    }
    case '3mf': {
      const group = new ThreeMFLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }

    // ---- mesh formats: text-based ----
    case 'obj': {
      const text = bufferToText(buffer)
      const group = new OBJLoader().parse(text)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'dae': {
      const text = bufferToText(buffer)
      const scene = new ColladaLoader().parse(text, '')
      const meshes = extractMeshes(scene.scene)
      return { meshes, objects: extractAllObjects(scene.scene) }
    }
    case 'wrl': {
      const text = bufferToText(buffer)
      const scene = new VRMLLoader().parse(text)
      const meshes = extractMeshes(scene)
      return { meshes, objects: extractAllObjects(scene) }
    }

    // ---- mesh formats: binary ----
    case 'ply': {
      // PLYLoader detects ascii vs binary from header
      // give it the raw ArrayBuffer for both cases
      const geo = new PLYLoader().parse(buffer)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case 'fbx': {
      const group = new FBXLoader().parse(buffer, '')
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case '3ds': {
      const group = new TDSLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'usdz': {
      const group = new USDZLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'vox': {
      const result = new VOXLoader().parse(buffer)
      const scene = result?.scene
      if (scene) {
        if (scene instanceof THREE.Mesh) {
          return { meshes: [scene], objects: [] }
        }
        const meshes = extractMeshes(scene)
        return { meshes, objects: extractAllObjects(scene) }
      }
      return { meshes: [], objects: [] }
    }
    case 'kmz': {
      const result = new KMZLoader().parse(buffer)
      const scene = result?.scene
      if (scene) {
        const meshes = extractMeshes(scene)
        return { meshes, objects: extractAllObjects(scene) }
      }
      return { meshes: [], objects: [] }
    }
    case 'amf': {
      // AMFLoader detects ZIP vs XML from raw buffer — pass binary, not text
      const group = new AMFLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'lwo': {
      // LWOLoader.parse() returns {meshes: Mesh[], materials: Material[]}, not a Group
      const result = new LWOLoader().parse(buffer, '', 'model')
      return { meshes: result?.meshes || [], objects: [] }
    }
    case 'md2': {
      // MD2Loader.parse() returns a BufferGeometry directly, not a Group
      const geo = new MD2Loader().parse(buffer)
      if (!geo) return { meshes: [], objects: [] }
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case '3dm': {
      const loader = new Rhino3dmLoader()
      loader.setLibraryPath('/wasm/rhino3dm/')
      const group = await new Promise<THREE.Group>((resolve, reject) => {
        loader.parse(buffer, resolve, reject)
      })
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }

    // ---- volume / pointcloud / special ----
    case 'vtk':
    case 'vtp': {
      const geo = new VTKLoader().parse(buffer)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case 'xyz': {
      const text = bufferToText(buffer)
      const geo = new XYZLoader().parse(text)
      // XYZ is atom positions — render as point cloud
      const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.1, color: 0xffffff }))
      return { meshes: [], objects: [points] }
    }
    case 'pdb': {
      const text = bufferToText(buffer)
      // PDBLoader.parse() returns {geometryAtoms, geometryBonds, json}, not a BufferGeometry
      const result = new PDBLoader().parse(text)
      const objects: THREE.Object3D[] = []
      if (result.geometryAtoms) {
        const atomPoints = new THREE.Points(result.geometryAtoms,
          new THREE.PointsMaterial({ size: 0.1, vertexColors: true }))
        objects.push(atomPoints)
      }
      if (result.geometryBonds && result.geometryBonds.attributes.position.count > 0) {
        const lineSegs = new THREE.LineSegments(result.geometryBonds,
          new THREE.LineBasicMaterial({ color: 0x888888 }))
        objects.push(lineSegs)
      }
      return { meshes: [], objects }
    }
    case 'nrrd': {
      // NRRD produces volume data (3D texture) — create a unit box with wireframe
      // so the user can see something; real volume rendering needs custom shaders
      const volume = new NRRDLoader().parse(buffer)
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const mesh = new THREE.Mesh(geo)
      mesh.name = 'NRRD proxy'
      return { meshes: [mesh], objects: [] }
    }
    case 'pcd': {
      const points = new PCDLoader().parse(buffer)
      // PCDLoader returns THREE.Points — render directly as point cloud
      if (points instanceof THREE.Points) {
        return { meshes: [], objects: [points] }
      }
      return { meshes: [], objects: [] }
    }

    // ---- animation ----
    case 'bvh': {
      const text = bufferToText(buffer)
      const result = new BVHLoader().parse(text)
      const skeleton = result.skeleton
      const objects: THREE.Object3D[] = []
      if (skeleton.bones.length > 0) {
        const rootBone = skeleton.bones[0]
        // Force bone matrix updates so SkeletonHelper has valid world transforms
        rootBone.updateMatrixWorld(true)
        const helper = new THREE.SkeletonHelper(rootBone)
        objects.push(helper)
      }
      return { meshes: [], objects, skeleton }
    }
    case 'mdd': {
      // MDD is morph data for an existing mesh — can't render standalone
      console.warn('[formatLoaders] MDD requires a base mesh — returning empty')
      return { meshes: [], objects: [] }
    }

    // ---- GCode ----
    case 'gcode': {
      const text = bufferToText(buffer)
      const group = new GCodeLoader().parse(text)
      const objects = extractAllObjects(group)
      // GCode produces line segments
      return { meshes: [], objects }
    }

    // ---- Draco ----
    case 'drc': {
      const loader = new DRACOLoader()
      loader.setDecoderPath('/wasm/draco/')
      const geometry = await loader.decodeDracoFile(buffer)
      const mesh = new THREE.Mesh(geometry)
      return { meshes: [mesh], objects: [] }
    }

    // ---- IFC (BIM) ----
    // IFC requires web-ifc-three (external package): npm install web-ifc-three web-ifc
    case 'ifc': {
      console.warn('[formatLoaders] IFC requires web-ifc-three package — not yet installed')
      return { meshes: [], objects: [] }
    }

    // ---- LDRAW ----
    case 'ldraw': {
      // LDrawLoader needs parts library path — parse text directly
      const text = bufferToText(buffer)
      const group = new LDrawLoader().parse(text, '')
      if (group) {
        const meshes = extractMeshes(group)
        return { meshes, objects: extractAllObjects(group) }
      }
      return { meshes: [], objects: [] }
    }

    default:
      console.error(`[formatLoaders] unknown format: ${format}`)
      return { meshes: [], objects: [] }
  }
}
