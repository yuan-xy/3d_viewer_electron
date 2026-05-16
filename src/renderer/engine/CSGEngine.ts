import * as THREE from 'three'
import Module from 'manifold-3d'

type ManifoldModule = Awaited<ReturnType<typeof Module>>

let manifoldModule: ManifoldModule | null = null

async function getModule(): Promise<ManifoldModule> {
  if (!manifoldModule) {
    manifoldModule = await Module()
  }
  return manifoldModule
}

/**
 * Convert a Three.js BufferGeometry to a manifold-3d Mesh.
 * Manifold expects: { numProp, triVerts: Uint32Array, vertProperties: Float32Array }
 * where vertProperties is interleaved [x,y,z, x,y,z, ...] (numProp=3 for positions only)
 */
function geometryToManifoldMesh(m: ManifoldModule, geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position')
  const index = geometry.getIndex()

  const numVert = positions.count
  const vertProperties = new Float32Array(numVert * 3)

  // Copy vertex positions
  for (let i = 0; i < numVert; i++) {
    vertProperties[i * 3] = positions.getX(i)
    vertProperties[i * 3 + 1] = positions.getY(i)
    vertProperties[i * 3 + 2] = positions.getZ(i)
  }

  let triVerts: Uint32Array
  if (index) {
    triVerts = new Uint32Array(index.array)
  } else {
    // Non-indexed geometry: every 3 vertices form a triangle
    triVerts = new Uint32Array(numVert)
    for (let i = 0; i < numVert; i++) {
      triVerts[i] = i
    }
  }

  return new m.Mesh({ numProp: 3, triVerts, vertProperties })
}

/**
 * Convert a manifold-3d Mesh back to Three.js BufferGeometry.
 */
function manifoldMeshToGeometry(mesh: { numProp: number; triVerts: Uint32Array; vertProperties: Float32Array }): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()

  // Extract positions (first 3 properties)
  const numVert = mesh.vertProperties.length / mesh.numProp
  const positions = new Float32Array(numVert * 3)
  for (let i = 0; i < numVert; i++) {
    positions[i * 3] = mesh.vertProperties[mesh.numProp * i]
    positions[i * 3 + 1] = mesh.vertProperties[mesh.numProp * i + 1]
    positions[i * 3 + 2] = mesh.vertProperties[mesh.numProp * i + 2]
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(Array.from(mesh.triVerts))
  geometry.computeVertexNormals()

  return geometry
}

export class CSGEngine {
  private ready = false

  async init(): Promise<void> {
    await getModule()
    this.ready = true
  }

  private checkReady() {
    if (!this.ready) throw new Error('CSGEngine not initialized. Call init() first.')
  }

  /**
   * Apply a boolean union of multiple Three.js geometries.
   */
  union(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    this.checkReady()
    const m = manifoldModule!

    const meshes = geometries.map((g) => new m.Manifold(geometryToManifoldMesh(m, g)))

    const result = m.Manifold.union(meshes)
    return manifoldMeshToGeometry(result.getMesh())
  }

  /**
   * Subtract geometries from the first geometry.
   */
  difference(base: THREE.BufferGeometry, subtract: THREE.BufferGeometry[]): THREE.BufferGeometry {
    this.checkReady()
    const m = manifoldModule!

    let result = new m.Manifold(geometryToManifoldMesh(m, base))
    for (const g of subtract) {
      result = m.Manifold.difference(result, new m.Manifold(geometryToManifoldMesh(m, g)))
    }
    return manifoldMeshToGeometry(result.getMesh())
  }

  /**
   * Intersect geometries.
   */
  intersection(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    this.checkReady()
    const m = manifoldModule!

    const meshes = geometries.map((g) => new m.Manifold(geometryToManifoldMesh(m, g)))
    const result = m.Manifold.intersection(meshes)
    return manifoldMeshToGeometry(result.getMesh())
  }

  /**
   * Cut a geometry with a plane. Returns both halves.
   * The plane normal points to the "positive" side.
   */
  cutByPlane(
    geometry: THREE.BufferGeometry,
    planeNormal: THREE.Vector3,
    planeOffset: number,
  ): { positive: THREE.BufferGeometry; negative: THREE.BufferGeometry } {
    this.checkReady()
    const m = manifoldModule!

    const manifold = new m.Manifold(geometryToManifoldMesh(m, geometry))
    const normal: [number, number, number] = [planeNormal.x, planeNormal.y, planeNormal.z]
    const pieces = manifold.splitByPlane(normal, planeOffset)

    return {
      positive: manifoldMeshToGeometry(pieces[0].getMesh()),
      negative: manifoldMeshToGeometry(pieces[1].getMesh()),
    }
  }

  /**
   * Subtract a cylindrical hole from the geometry.
   */
  drillHole(
    geometry: THREE.BufferGeometry,
    center: THREE.Vector3,
    direction: THREE.Vector3,
    radius: number,
  ): THREE.BufferGeometry {
    this.checkReady()
    const m = manifoldModule!

    const manifold = new m.Manifold(geometryToManifoldMesh(m, geometry))

    // Create a cylinder for the hole
    const height = 100 // large enough to go through any model
    const cylinder = m.Manifold.cylinder(height, radius, radius, 64, true)

    // Align cylinder with the hole direction (default cylinder is along Z)
    const dir = direction.clone().normalize()
    const zAxis = new THREE.Vector3(0, 0, 1)
    const quaternion = new THREE.Quaternion().setFromUnitVectors(zAxis, dir)
    const euler = new THREE.Euler().setFromQuaternion(quaternion)

    cylinder.rotate(euler.x, euler.y, euler.z)
    cylinder.translate(center.x, center.y, center.z)

    const result = m.Manifold.difference(manifold, cylinder)
    return manifoldMeshToGeometry(result.getMesh())
  }

  /**
   * Extrude a face/polygon along a direction.
   */
  extrude(
    geometry: THREE.BufferGeometry,
    _faceTriangles: number[],
    distance: number,
  ): THREE.BufferGeometry {
    this.checkReady()
    const m = manifoldModule!

    const manifold = new m.Manifold(geometryToManifoldMesh(m, geometry))

    // Create extruded geometry by adding a translated copy and connecting
    // This is simplified - a full implementation would isolate the face and extrude it
    const translation = new THREE.Vector3(0, 0, distance)
    const extrudedManifold = new m.Manifold(geometryToManifoldMesh(m, geometry))
    extrudedManifold.translate(translation.x, translation.y, translation.z)

    const result = m.Manifold.union([manifold, extrudedManifold])
    return manifoldMeshToGeometry(result.getMesh())
  }

  /**
   * Create basic primitive geometry.
   */
  createCube(size: THREE.Vector3, center = false): THREE.BufferGeometry {
    this.checkReady()
    const m = manifoldModule!
    const cube = m.Manifold.cube([size.x, size.y, size.z], center)
    return manifoldMeshToGeometry(cube.getMesh())
  }

  createCylinder(height: number, radius: number, center = false): THREE.BufferGeometry {
    this.checkReady()
    const m = manifoldModule!
    const cyl = m.Manifold.cylinder(height, radius, radius, 64, center)
    return manifoldMeshToGeometry(cyl.getMesh())
  }

  createSphere(radius: number): THREE.BufferGeometry {
    this.checkReady()
    const m = manifoldModule!
    const sphere = m.Manifold.sphere(radius, 64)
    return manifoldMeshToGeometry(sphere.getMesh())
  }
}

// Singleton
export const csgEngine = new CSGEngine()
