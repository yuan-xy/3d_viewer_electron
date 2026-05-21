import * as THREE from 'three'

/**
 * Clone a mesh's geometry for use in a new Mesh.
 *
 * Morph attributes are preserved. The caller MUST call {@link initMorphTargets}
 * on the resulting Mesh to prevent Three.js from crashing in
 * WebGLMorphtargets.update — R3F assigns geometry as a plain property, which
 * does NOT call updateMorphTargets(), leaving morphTargetInfluences undefined.
 */
export function cloneMeshGeometry(src: THREE.Mesh): THREE.BufferGeometry {
  return src.geometry.clone()
}

/**
 * Initialize morphTargetInfluences on a mesh whose geometry has morphAttributes.
 *
 * R3F creates a fresh THREE.Mesh (no geometry in constructor) and later assigns
 * geometry as a plain property, which does NOT call updateMorphTargets(). If
 * geometry.morphAttributes is non-empty while morphTargetInfluences is
 * undefined, Three.js crashes every render frame.
 *
 * Call this after creating a mesh with a cloned geometry that may carry morph
 * attributes (e.g. from GLTFLoader output).
 */
export function initMorphTargets(mesh: THREE.Mesh): void {
  const geo = mesh.geometry
  if (geo.morphAttributes) {
    const keys = Object.keys(geo.morphAttributes)
    if (keys.length > 0) {
      const firstAttr = geo.morphAttributes[keys[0]]
      if (firstAttr && firstAttr.length > 0) {
        mesh.morphTargetInfluences = new Array(firstAttr.length).fill(0)
      }
    }
  }
}
