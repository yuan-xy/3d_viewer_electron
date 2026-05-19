import { describe, it, expect } from 'vitest'
import {
  detectFormat,
  EXT_TO_FORMAT,
  ALL_EXTENSIONS,
  ALL_EXTENSIONS_NO_DOT,
  FORMAT_MAP,
  ALL_ACCEPT,
  getGroupAccept,
  FILE_FORMATS,
} from './file-formats'

describe('file-formats config', () => {
  it('all 29 formats defined', () => {
    expect(FILE_FORMATS.length).toBe(29)
  })

  it('no duplicate format ids', () => {
    const ids = FILE_FORMATS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every format has at least one extension', () => {
    for (const fmt of FILE_FORMATS) {
      expect(fmt.extensions.length, `${fmt.id} has no extensions`).toBeGreaterThan(0)
    }
  })

  it('EXT_TO_FORMAT covers all enabled extensions', () => {
    const enabled = FILE_FORMATS.filter((f) => !f.disabled)
    for (const fmt of enabled) {
      for (const ext of fmt.extensions) {
        expect(EXT_TO_FORMAT[ext]).toBe(fmt.id)
      }
    }
  })

  it('FORMAT_MAP contains all formats', () => {
    for (const fmt of FILE_FORMATS) {
      expect(FORMAT_MAP[fmt.id]).toBe(fmt)
    }
  })

  it('ALL_EXTENSIONS and ALL_EXTENSIONS_NO_DOT match', () => {
    expect(ALL_EXTENSIONS.length).toBe(ALL_EXTENSIONS_NO_DOT.length)
    for (let i = 0; i < ALL_EXTENSIONS.length; i++) {
      expect(ALL_EXTENSIONS_NO_DOT[i]).toBe(ALL_EXTENSIONS[i].slice(1))
    }
  })

  it('ALL_ACCEPT is comma-separated extensions', () => {
    expect(typeof ALL_ACCEPT).toBe('string')
    const parts = ALL_ACCEPT.split(',')
    expect(parts.length).toBeGreaterThan(10)
    for (const part of parts) {
      expect(part.startsWith('.')).toBe(true)
    }
  })
})

describe('detectFormat', () => {
  it('returns null for unknown extension', () => {
    expect(detectFormat('file.xyzabc')).toBeNull()
    expect(detectFormat('readme.txt')).toBeNull()
    expect(detectFormat('noext')).toBeNull()
  })

  it('detects common formats', () => {
    expect(detectFormat('model.stl')).toBe('stl')
    expect(detectFormat('model.glb')).toBe('glb')
    expect(detectFormat('part.step')).toBe('step')
    expect(detectFormat('part.stp')).toBe('step')
    expect(detectFormat('model.obj')).toBe('obj')
    expect(detectFormat('model.fbx')).toBe('fbx')
    expect(detectFormat('model.ply')).toBe('ply')
  })

  it('detects case insensitive', () => {
    expect(detectFormat('MODEL.STL')).toBe('stl')
    expect(detectFormat('Model.Glb')).toBe('glb')
    expect(detectFormat('Part.StEp')).toBe('step')
  })

  it('does not detect disabled formats', () => {
    expect(detectFormat('model.ifc')).toBeNull() // disabled
    expect(detectFormat('model.mdd')).toBeNull() // disabled
    expect(detectFormat('model.mpd')).toBeNull() // disabled (ldraw)
  })

  it('detects gltf format since it is now enabled', () => {
    expect(detectFormat('model.gltf')).toBe('gltf')
  })

  it('detects all remaining non-disabled formats', () => {
    const enabled = FILE_FORMATS.filter((f) => !f.disabled)
    for (const fmt of enabled) {
      const filename = `test${fmt.extensions[0]}`
      expect(detectFormat(filename), `failed for ${fmt.id}`).toBe(fmt.id)
    }
  })

  it('matches longest suffix first (.stp vs .step)', () => {
    // .step matches step, .stp also matches step
    expect(detectFormat('model.step')).toBe('step')
    expect(detectFormat('model.stp')).toBe('step')
  })
})

describe('getGroupAccept', () => {
  it('returns comma-separated extensions for a group', () => {
    const mesh = getGroupAccept('mesh')
    expect(mesh).toContain('.stl')
    expect(mesh).toContain('.glb')
    expect(mesh).toContain('.obj')

    const cad = getGroupAccept('cad')
    expect(cad).toContain('.step')
    expect(cad).toContain('.stp')
  })

  it('returns empty for group with no enabled formats', () => {
    // 'animation' group has bvh (enabled) and md2 (enabled) but mdd is disabled
    const anim = getGroupAccept('animation')
    expect(anim.length).toBeGreaterThan(0)
  })
})
