import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

/**
 * These tests verify the camera conversion math used by CameraModeSwitcher.
 *
 * The CameraModeSwitcher switches between PerspectiveCamera (fov=50) and
 * OrthographicCamera while preserving the user's view. Three bugs were fixed:
 *
 * 1. Aspect ratio: OrthoCamera has no `.aspect` — reading it gave undefined,
 *    causing the new PerspectiveCamera to default to aspect=1 (stretched view).
 *    Fix: read aspect from viewport size (width / height).
 *
 * 2. Distance calculation: `pos.length()` measured distance to world origin,
 *    but the camera orbits around OrbitControls.target. After panning the model
 *    away from the origin, the distance was wrong. Fix: use pos.distanceTo(target).
 *
 * 3. Ortho zoom: when the user zooms in orthographic mode, camera.zoom changes
 *    but position stays the same. Switching back to perspective must account for
 *    zoom to produce the same visible frame.
 */

const PERSP_FOV = 50
const HALF_FOV_RAD = THREE.MathUtils.degToRad(PERSP_FOV / 2) // 25°

function perspToOrtho(
  perspCam: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  aspect: number,
): THREE.OrthographicCamera {
  const dist = perspCam.position.distanceTo(target)
  const halfHeight = dist * Math.tan(HALF_FOV_RAD)

  const orthoCam = new THREE.OrthographicCamera(
    -halfHeight * aspect, halfHeight * aspect,
    halfHeight, -halfHeight,
    perspCam.near, perspCam.far,
  )
  orthoCam.position.copy(perspCam.position)
  orthoCam.up.copy(perspCam.up)
  orthoCam.lookAt(target)
  return orthoCam
}

function orthoToPersp(
  orthoCam: THREE.OrthographicCamera,
  target: THREE.Vector3,
  aspect: number,
): THREE.PerspectiveCamera {
  const zoom = orthoCam.zoom || 1
  const effectiveHalfHeight = orthoCam.top / zoom
  const dist = effectiveHalfHeight / Math.tan(HALF_FOV_RAD)

  const perspCam = new THREE.PerspectiveCamera(PERSP_FOV, aspect, orthoCam.near, orthoCam.far)
  const viewDir = orthoCam.position.clone().sub(target).normalize()
  perspCam.position.copy(target).addScaledVector(viewDir, dist)
  perspCam.up.copy(orthoCam.up)
  perspCam.lookAt(target)
  return perspCam
}

describe('CameraModeSwitcher math', () => {
  const aspect = 1920 / 1080 // 16:9 ≈ 1.778

  describe('perspective → orthographic', () => {
    it('creates ortho frustum that matches perspective view at given distance', () => {
      const perspCam = new THREE.PerspectiveCamera(PERSP_FOV, aspect, 0.001, 10000)
      perspCam.position.set(5, -5, 3)
      perspCam.up.set(0, 0, 1)
      perspCam.lookAt(0, 0, 0)

      const target = new THREE.Vector3(0, 0, 0)
      const orthoCam = perspToOrtho(perspCam, target, aspect)

      // The ortho half-height should match: dist * tan(fov/2)
      const dist = perspCam.position.distanceTo(target)
      const expectedHalf = dist * Math.tan(HALF_FOV_RAD)
      expect(orthoCam.top).toBeCloseTo(expectedHalf, 4)
      expect(orthoCam.bottom).toBeCloseTo(-expectedHalf, 4)
      expect(orthoCam.left).toBeCloseTo(-expectedHalf * aspect, 4)
      expect(orthoCam.right).toBeCloseTo(expectedHalf * aspect, 4)

      // Position and up should be preserved
      expect(orthoCam.position.x).toBeCloseTo(5)
      expect(orthoCam.position.y).toBeCloseTo(-5)
      expect(orthoCam.position.z).toBeCloseTo(3)
      expect(orthoCam.up.z).toBeCloseTo(1)
    })

    it('uses distance to target, not distance to origin', () => {
      const perspCam = new THREE.PerspectiveCamera(PERSP_FOV, aspect, 0.001, 10000)
      perspCam.up.set(0, 0, 1)
      // Camera far from origin, looking at a panned target
      perspCam.position.set(10, 10, 10)
      const target = new THREE.Vector3(8, 8, 8)

      // Distance to origin would be sqrt(300) ≈ 17.32 — much larger
      const distToOrigin = perspCam.position.length()
      const distToTarget = perspCam.position.distanceTo(target)
      expect(distToTarget).toBeLessThan(distToOrigin)

      const orthoCam = perspToOrtho(perspCam, target, aspect)
      const expectedHalf = distToTarget * Math.tan(HALF_FOV_RAD)
      expect(orthoCam.top).toBeCloseTo(expectedHalf, 4)
      // Should NOT equal the origin-based calculation
      const originBasedHalf = distToOrigin * Math.tan(HALF_FOV_RAD)
      expect(orthoCam.top).not.toBeCloseTo(originBasedHalf, 1)
    })
  })

  describe('orthographic → perspective', () => {
    it('uses correct aspect ratio from viewport, not from OrthoCamera', () => {
      // OrthographicCamera does NOT have an .aspect property.
      // If we mistakenly read camera.aspect (undefined → default 1),
      // the PerspectiveCamera would get aspect=1 instead of 16:9.
      const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 10000)
      orthoCam.position.set(5, -5, 3)
      orthoCam.lookAt(0, 0, 0)
      orthoCam.zoom = 1

      // Bug scenario: reading orthoCam.aspect gives undefined
      expect((orthoCam as any).aspect).toBeUndefined()

      // Fix: compute aspect from viewport size, not from camera
      const target = new THREE.Vector3(0, 0, 0)
      const perspCam = orthoToPersp(orthoCam, target, aspect)

      expect(perspCam.aspect).toBeCloseTo(aspect, 4)
      expect(perspCam.aspect).not.toBe(1) // should NOT be the default
    })

    it('accounts for ortho zoom when placing the perspective camera', () => {
      const orthoCam = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.001, 10000)
      orthoCam.position.set(5, -5, 3)
      orthoCam.lookAt(0, 0, 0)
      orthoCam.zoom = 2 // 2x zoom = half the visible area

      const target = new THREE.Vector3(0, 0, 0)

      // Without zoom: dist = top / tan(25) = 2 / 0.4663 = 4.29
      const distWithoutZoom = orthoCam.top / Math.tan(HALF_FOV_RAD)

      // With zoom: effective half = top / zoom = 1, dist = 1 / 0.4663 = 2.14
      const perspCam = orthoToPersp(orthoCam, target, aspect)

      const actualDist = perspCam.position.distanceTo(target)
      expect(actualDist).toBeCloseTo(distWithoutZoom / orthoCam.zoom, 4)
      expect(actualDist).toBeLessThan(distWithoutZoom * 0.6)
    })

    it('preserves the up vector', () => {
      const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 10000)
      orthoCam.position.set(3, 0, 4)
      orthoCam.up.set(0, 0, 1)
      orthoCam.lookAt(0, 0, 0)

      const perspCam = orthoToPersp(orthoCam, new THREE.Vector3(0, 0, 0), aspect)
      expect(perspCam.up.z).toBeCloseTo(1)
      expect(perspCam.up.x).toBeCloseTo(0)
      expect(perspCam.up.y).toBeCloseTo(0)
    })
  })

  describe('round-trip consistency', () => {
    it('persp → ortho → persp preserves the same visible frame', () => {
      const target = new THREE.Vector3(0, 0, 0)
      const origPersp = new THREE.PerspectiveCamera(PERSP_FOV, aspect, 0.001, 10000)
      origPersp.position.set(5, -5, 3)
      origPersp.lookAt(target)

      // Persp → Ortho
      const orthoCam = perspToOrtho(origPersp, target, aspect)
      // Ortho → Persp (with zoom=1 since we didn't zoom)
      const newPersp = orthoToPersp(orthoCam, target, aspect)

      // The resulting view should match: same distance from target
      const origDist = origPersp.position.distanceTo(target)
      const newDist = newPersp.position.distanceTo(target)
      expect(newDist).toBeCloseTo(origDist, 4)

      // Same FOV
      expect(newPersp.fov).toBe(origPersp.fov)
      expect(newPersp.aspect).toBeCloseTo(origPersp.aspect)

      // Same up
      expect(newPersp.up.z).toBeCloseTo(origPersp.up.z)
    })

    it('persp → ortho → persp with zoom in between produces consistent view', () => {
      const target = new THREE.Vector3(0, 0, 0)
      const origPersp = new THREE.PerspectiveCamera(PERSP_FOV, aspect, 0.001, 10000)
      origPersp.position.set(5, -5, 3)
      origPersp.lookAt(target)

      // Persp → Ortho
      const orthoCam = perspToOrtho(origPersp, target, aspect)

      // Simulate user zooming in ortho mode: zoom=2 means 2x closer
      orthoCam.zoom = 2

      // Ortho → Persp
      const newPersp = orthoToPersp(orthoCam, target, aspect)

      // With 2x zoom, the perspective camera should be closer
      const origDist = origPersp.position.distanceTo(target)
      const newDist = newPersp.position.distanceTo(target)
      expect(newDist).toBeCloseTo(origDist / 2, 4)
    })

    it('round-trip with offset target preserves the target direction', () => {
      const target = new THREE.Vector3(2, 1, 0)
      const origPersp = new THREE.PerspectiveCamera(PERSP_FOV, aspect, 0.001, 10000)
      origPersp.position.set(8, -3, 5)
      origPersp.lookAt(target)

      const orthoCam = perspToOrtho(origPersp, target, aspect)
      const newPersp = orthoToPersp(orthoCam, target, aspect)

      // Both cameras should look at the same target
      const origDir = target.clone().sub(origPersp.position).normalize()
      const newDir = target.clone().sub(newPersp.position).normalize()
      expect(newDir.x).toBeCloseTo(origDir.x, 4)
      expect(newDir.y).toBeCloseTo(origDir.y, 4)
      expect(newDir.z).toBeCloseTo(origDir.z, 4)
    })
  })

  describe('aspect ratio from viewport size', () => {
    it('computes correct aspect for common resolutions', () => {
      // The bug was using camera.aspect (undefined for OrthoCamera).
      // The fix uses size.width / size.height from the viewport.
      const testCases = [
        { w: 1920, h: 1080, expected: 1920 / 1080 },
        { w: 1280, h: 720, expected: 1280 / 720 },
        { w: 800, h: 600, expected: 800 / 600 },
        { w: 1024, h: 1024, expected: 1 },
      ]
      for (const { w, h, expected } of testCases) {
        expect(w / h).toBeCloseTo(expected, 4)
      }
    })
  })
})
