import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clone or convert a source material for use in the PBR rendering pipeline.
 * Returns null when the source is null/undefined — the caller should fall
 * back to a default material in that case.
 */
export function cloneAndConvertMaterial(
  src: THREE.Material | THREE.Material[] | null | undefined,
): THREE.Material | THREE.Material[] | null {
  if (src == null) return null
  if (Array.isArray(src)) {
    return src.map((m) => convertSingle(m))
  }
  return convertSingle(src)
}

/** Create the default PBR material for meshes without source materials. */
export function createDefaultMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial()
  mat.color.setHex(0x9ba6ae)
  mat.roughness = 0.35
  mat.metalness = 0.1
  mat.side = THREE.FrontSide
  mat.needsUpdate = true
  return mat
}

/**
 * Dispose a material and all its texture references.
 * Safe to call on null, undefined, single materials, or arrays.
 */
export function disposeMaterial(
  mat: THREE.Material | THREE.Material[] | null | undefined,
): void {
  if (mat == null) return
  if (Array.isArray(mat)) {
    for (const m of mat) disposeSingle(m)
    return
  }
  disposeSingle(mat)
}

/**
 * Extract the dominant colour from a material for use as wireframe / mesh-mode
 * line colour. Returns null when no meaningful colour can be extracted.
 */
export function getMaterialColor(
  mat: THREE.Material | THREE.Material[] | null | undefined,
): string | null {
  if (mat == null) return null
  const target = Array.isArray(mat) ? mat[0] : mat
  if (!target) return null

  // Prefer color property when it differs from the default white
  if ('color' in target && target.color instanceof THREE.Color) {
    const c = target.color
    if (c.r !== 1 || c.g !== 1 || c.b !== 1) {
      return '#' + c.getHexString()
    }
  }

  // For textured materials, fall back to a neutral grey rather than guessing
  // an average colour from pixel data.
  if ('map' in target && (target as THREE.MeshStandardMaterial).map) return null

  // MeshNormalMaterial — use a distinctive blue
  if (target instanceof THREE.MeshNormalMaterial) return '#4488ff'

  return null
}

// ---------------------------------------------------------------------------
// Internal dispatch
// ---------------------------------------------------------------------------

function convertSingle(src: THREE.Material): THREE.Material {
  let dst: THREE.Material
  if (src instanceof THREE.MeshPhysicalMaterial) {
    dst = src.clone()
  } else if (src instanceof THREE.MeshStandardMaterial) {
    dst = src.clone()
  } else if (src instanceof THREE.MeshPhongMaterial) {
    dst = phongToStandard(src)
  } else if (src instanceof THREE.MeshLambertMaterial) {
    dst = lambertToStandard(src)
  } else if (src instanceof THREE.MeshBasicMaterial) {
    dst = basicToStandard(src)
  } else if (src instanceof THREE.MeshToonMaterial) {
    dst = toonToStandard(src)
  } else if (src instanceof THREE.MeshNormalMaterial) {
    dst = src.clone()
  } else if (src instanceof THREE.MeshMatcapMaterial) {
    dst = matcapToStandard(src)
  } else {
    dst = fallbackToStandard(src)
  }

  // Apply polygon offset to prevent z-fighting between adjacent/overlapping surfaces
  if (dst instanceof THREE.MeshStandardMaterial || dst instanceof THREE.MeshPhysicalMaterial) {
    dst.polygonOffset = true
    dst.polygonOffsetFactor = -1
    dst.polygonOffsetUnits = -1
  }

  return dst
}

// ---------------------------------------------------------------------------
// Per-type converters
// ---------------------------------------------------------------------------

function phongToStandard(src: THREE.MeshPhongMaterial): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.lightMap = src.lightMap
  dst.lightMapIntensity = src.lightMapIntensity
  dst.aoMap = src.aoMap
  dst.aoMapIntensity = src.aoMapIntensity
  dst.emissive.copy(src.emissive)
  dst.emissiveMap = src.emissiveMap
  dst.emissiveIntensity = src.emissiveIntensity
  dst.bumpMap = src.bumpMap
  dst.bumpScale = src.bumpScale
  dst.normalMap = src.normalMap
  dst.normalScale.copy(src.normalScale)
  dst.displacementMap = src.displacementMap
  dst.displacementScale = src.displacementScale
  dst.displacementBias = src.displacementBias
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.wireframe = src.wireframe
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog
  dst.envMap = src.envMap
  dst.envMapIntensity = src.envMapIntensity

  // Phong shininess (0–1000) → PBR roughness (0–1)
  dst.roughness = 1 - Math.sqrt(Math.min(src.shininess, 1000) / 1000)

  // Phong specular luminance → PBR metalness (rough approximation)
  const specLuminance =
    0.2126 * src.specular.r + 0.7152 * src.specular.g + 0.0722 * src.specular.b
  dst.metalness = Math.min(specLuminance, 1.0)

  // Note: specularMap is NOT mapped to roughnessMap because the semantics
  // differ fundamentally (specular intensity ≠ roughness). The uniform
  // roughness above provides a reasonable approximation.

  dst.needsUpdate = true
  return dst
}

function lambertToStandard(
  src: THREE.MeshLambertMaterial,
): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.lightMap = src.lightMap
  dst.lightMapIntensity = src.lightMapIntensity
  dst.aoMap = src.aoMap
  dst.aoMapIntensity = src.aoMapIntensity
  dst.emissive.copy(src.emissive)
  dst.emissiveMap = src.emissiveMap
  dst.emissiveIntensity = src.emissiveIntensity
  dst.bumpMap = src.bumpMap
  dst.bumpScale = src.bumpScale
  dst.normalMap = src.normalMap
  dst.normalScale.copy(src.normalScale)
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog

  dst.roughness = 0.9
  dst.metalness = 0.0

  dst.needsUpdate = true
  return dst
}

function basicToStandard(
  src: THREE.MeshBasicMaterial,
): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog

  dst.roughness = 1.0
  dst.metalness = 0.0

  dst.needsUpdate = true
  return dst
}

function toonToStandard(src: THREE.MeshToonMaterial): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.gradientMap = src.gradientMap
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog
  dst.emissive.copy(src.emissive)
  dst.emissiveMap = src.emissiveMap
  dst.emissiveIntensity = src.emissiveIntensity
  dst.bumpMap = src.bumpMap
  dst.bumpScale = src.bumpScale
  dst.normalMap = src.normalMap
  dst.normalScale.copy(src.normalScale)
  dst.lightMap = src.lightMap
  dst.lightMapIntensity = src.lightMapIntensity
  dst.aoMap = src.aoMap
  dst.aoMapIntensity = src.aoMapIntensity

  dst.roughness = 0.6
  dst.metalness = 0.0

  dst.needsUpdate = true
  return dst
}

function matcapToStandard(
  src: THREE.MeshMatcapMaterial,
): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog

  dst.roughness = 1.0
  dst.metalness = 0.0

  dst.needsUpdate = true
  return dst
}

function fallbackToStandard(src: THREE.Material): THREE.MeshStandardMaterial {
  const dst = new THREE.MeshStandardMaterial()

  if ('color' in src && src.color instanceof THREE.Color) {
    dst.color.copy(src.color)
  }
  if ('opacity' in src && typeof src.opacity === 'number') {
    dst.opacity = src.opacity
    dst.transparent = src.transparent ?? dst.opacity < 1
  }
  if ('side' in src && typeof src.side === 'number') {
    dst.side = src.side as THREE.Side
  }
  dst.roughness = 0.5
  dst.metalness = 0.0
  dst.needsUpdate = true
  return dst
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function disposeSingle(mat: THREE.Material): void {
  for (const key of Object.keys(mat)) {
    const value = (mat as Record<string, unknown>)[key]
    if (value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  mat.dispose()
}
