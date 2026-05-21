import * as THREE from 'three'
import { loadFormat } from '@/engine/formatLoaders'
import type { FormatId } from '@/config/file-formats'
import { getDefaultUpAxis } from '@/config/file-formats'

const WIDTH = 200
const HEIGHT = 150

let renderer: THREE.WebGLRenderer | null = null
let canvas: HTMLCanvasElement | null = null

function getRenderer(): THREE.WebGLRenderer {
  if (renderer) return renderer

  canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  canvas.style.display = 'none'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  })
  if (!ctx) throw new Error('WebGL2 not available for thumbnail generation')

  renderer = new THREE.WebGLRenderer({
    canvas,
    context: ctx,
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(WIDTH, HEIGHT, false)
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2

  return renderer
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose()
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => disposeMaterial(m))
        } else {
          disposeMaterial(obj.material)
        }
      }
    }
  })
}

function disposeMaterial(mat: THREE.Material): void {
  for (const key of Object.keys(mat)) {
    const value = (mat as Record<string, unknown>)[key]
    if (value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  mat.dispose()
}

function fitCameraToMeshes(
  meshes: THREE.Mesh[],
  camera: THREE.PerspectiveCamera,
  upAxis: 'y' | 'z',
): void {
  const box = new THREE.Box3()
  meshes.forEach((m) => {
    m.updateWorldMatrix(true, false)
    box.expandByObject(m)
  })

  const center = new THREE.Vector3()
  box.getCenter(center)
  const size = new THREE.Vector3()
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z, 0.01)

  const dist = maxDim * 1.8
  const camPos = new THREE.Vector3(dist * 0.7, dist * 0.6, dist)
  camPos.add(center)

  camera.position.copy(camPos)
  camera.lookAt(center)

  if (upAxis === 'z') {
    camera.up.set(0, 0, 1)
  } else {
    camera.up.set(0, 1, 0)
  }

  camera.near = maxDim * 0.001
  camera.far = maxDim * 10
  camera.updateProjectionMatrix()
}

export async function generateThumbnail(
  buffer: ArrayBuffer,
  format: FormatId,
): Promise<Blob | null> {
  const r = getRenderer()
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambient)
  const dir1 = new THREE.DirectionalLight(0xffffff, 1.0)
  dir1.position.set(1, 1, 1)
  scene.add(dir1)
  const dir2 = new THREE.DirectionalLight(0x8888ff, 1.0)
  dir2.position.set(-0.5, -0.3, -1)
  scene.add(dir2)

  const camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT)

  try {
    const result = await loadFormat(buffer, format)
    const allObjects: THREE.Object3D[] = [...result.meshes, ...result.objects]
    if (result.sceneRoot) allObjects.push(result.sceneRoot)

    if (allObjects.length === 0) {
      disposeScene(scene)
      return null
    }

    const group = new THREE.Group()
    allObjects.forEach((obj) => group.add(obj.clone()))
    scene.add(group)

    const upAxis = getDefaultUpAxis(format, buffer)
    const meshes: THREE.Mesh[] = []
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) meshes.push(obj)
    })

    if (meshes.length > 0) {
      fitCameraToMeshes(meshes, camera, upAxis)
    } else {
      camera.position.set(0, 0, 5)
      camera.lookAt(0, 0, 0)
    }

    r.render(scene, camera)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas!.toBlob((b) => resolve(b), 'image/png')
    })

    disposeScene(scene)

    return blob
  } catch (err) {
    console.warn('[thumbnailGenerator] failed for format', format, err)
    disposeScene(scene)
    return null
  }
}

export function disposeThumbnailRenderer(): void {
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
  if (canvas && canvas.parentNode) {
    canvas.parentNode.removeChild(canvas)
  }
  canvas = null
}
