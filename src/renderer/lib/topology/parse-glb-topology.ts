import type { BufferViewDescriptor, GlbContainer, SelectorBundle, SelectorManifest } from './types'

const STEP_TOPOLOGY_EXTENSION = 'STEP_T'

// ---- helpers ----

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

// ---- GLB container ----

export function parseGlbContainer(arrayBuffer: ArrayBuffer): GlbContainer {
  const data = new DataView(arrayBuffer)

  if (
    data.byteLength < 20 ||
    data.getUint32(0, true) !== 0x46546c67 || // "glTF"
    data.getUint32(4, true) !== 2
  ) {
    throw new Error('Invalid GLB topology container')
  }

  const totalLength = Math.min(data.getUint32(8, true), data.byteLength)
  let offset = 12
  let json: Record<string, unknown> | null = null
  let bin: GlbContainer['bin'] | null = null

  while (offset + 8 <= totalLength) {
    const chunkLength = data.getUint32(offset, true)
    const chunkType = data.getUint32(offset + 4, true)
    offset += 8

    if (offset + chunkLength > totalLength) {
      throw new Error('Invalid GLB chunk length')
    }

    if (chunkType === 0x4e4f534a) {
      // "JSON"
      const jsonBytes = arrayBuffer.slice(offset, offset + chunkLength)
      json = JSON.parse(new TextDecoder('utf-8').decode(jsonBytes).trim())
    } else if (chunkType === 0x004e4942) {
      // "BIN\0"
      bin = {
        buffer: arrayBuffer,
        byteOffset: offset,
        byteLength: chunkLength,
      }
    }

    offset += chunkLength
    const remainder = chunkLength % 4
    if (remainder !== 0) {
      offset += 4 - remainder
    }
  }

  if (!json || !bin) {
    throw new Error('GLB topology requires JSON and BIN chunks')
  }

  return { json, bin }
}

// ---- bufferView range lookup ----

export function glbBufferViewRange(
  gltf: Record<string, unknown>,
  bin: GlbContainer['bin'],
  viewIndex: number,
): { byteOffset: number; byteLength: number } | null {
  const index = Number(viewIndex)
  const bufferViews = Array.isArray(gltf?.bufferViews) ? gltf.bufferViews : []
  const view = bufferViews[index] as Record<string, unknown> | undefined

  if (!Number.isInteger(index) || !view || Number(view.buffer || 0) !== 0) {
    return null
  }

  const byteOffset = bin.byteOffset + Number(view.byteOffset || 0)
  const byteLength = Number(view.byteLength || 0)

  if (!Number.isFinite(byteOffset) || !Number.isFinite(byteLength) || byteLength < 0) {
    return null
  }

  if (byteOffset < bin.byteOffset || byteOffset + byteLength > bin.byteOffset + bin.byteLength) {
    return null
  }

  return { byteOffset, byteLength }
}

// ---- build a single typed view ----

export function buildTypedView(
  glb: GlbContainer,
  view: BufferViewDescriptor,
): Float32Array | Uint32Array | null {
  if (!isObject(view)) {
    return null
  }

  const range = glbBufferViewRange(glb.json, glb.bin, view.bufferView)
  if (!range) {
    return null
  }

  const count = Number(view.count || 0)
  const relativeOffset = Number(view.byteOffset || 0)

  if (!Number.isFinite(count) || count < 0 || !Number.isFinite(relativeOffset) || relativeOffset < 0) {
    return null
  }

  const byteOffset = range.byteOffset + relativeOffset

  if (view.dtype === 'float32') {
    return new Float32Array(glb.bin.buffer, byteOffset, count)
  }
  if (view.dtype === 'uint32') {
    return new Uint32Array(glb.bin.buffer, byteOffset, count)
  }

  return null
}

// ---- build all selector buffers from manifest.views ----

export function buildSelectorBuffers(
  manifest: SelectorManifest,
  glb: GlbContainer,
): Record<string, Float32Array | Uint32Array> {
  const views = manifest?.buffers?.views
  if (!isObject(views)) {
    return {}
  }

  const output: Record<string, Float32Array | Uint32Array> = {}
  for (const [name, view] of Object.entries(views)) {
    const descriptor = view as BufferViewDescriptor
    const typed = buildTypedView(glb, descriptor)
    if (typed) {
      output[name] = typed
    }
  }

  return output
}

// ---- STEP_T extension ----

export function stepTopologyExtension(glb: GlbContainer): Record<string, unknown> {
  const gltfJson = glb.json
  const extensions = gltfJson?.extensions as Record<string, unknown> | undefined
  const extension = extensions?.[STEP_TOPOLOGY_EXTENSION]

  if (!isObject(extension) || Number(extension.schemaVersion) !== 2) {
    throw new Error(`GLB is missing ${STEP_TOPOLOGY_EXTENSION}`)
  }

  return extension
}

// ---- decode a bufferView as JSON ----

export function parseJsonBufferView(
  glb: GlbContainer,
  viewIndex: number,
  encoding = 'utf-8',
): Record<string, unknown> | null {
  const range = glbBufferViewRange(glb.json, glb.bin, viewIndex)
  if (!range) {
    return null
  }

  const bytes = new Uint8Array(glb.bin.buffer, range.byteOffset, range.byteLength)
  return JSON.parse(new TextDecoder(String(encoding || 'utf-8')).decode(bytes))
}

// ---- convert GLB ArrayBuffer → SelectorBundle ----

function selectorBundleFromGlbBuffer(arrayBuffer: ArrayBuffer): SelectorBundle {
  const glb = parseGlbContainer(arrayBuffer)
  const extension = stepTopologyExtension(glb)
  const manifest = parseJsonBufferView(glb, extension.selectorView as number, extension.encoding as string | undefined)

  if (!isObject(manifest)) {
    throw new Error(`${STEP_TOPOLOGY_EXTENSION} selectorView is not available`)
  }

  if ((manifest?.buffers as Record<string, unknown> | undefined)?.littleEndian === false) {
    throw new Error('Big-endian selector buffers are not supported')
  }

  const typedManifest = manifest as unknown as SelectorManifest

  return {
    manifest: typedManifest,
    buffers: buildSelectorBuffers(typedManifest, glb),
  }
}

// ---- public API ----

export function extractSelectorBundle(arrayBuffer: ArrayBuffer): SelectorBundle | null {
  try {
    return selectorBundleFromGlbBuffer(arrayBuffer)
  } catch {
    return null
  }
}
