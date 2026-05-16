// ---- GLB binary container ----

export interface GlbContainer {
  json: Record<string, unknown>
  bin: {
    buffer: ArrayBuffer
    byteOffset: number
    byteLength: number
  }
}

// ---- Buffer view descriptor (as it appears in manifest.buffers.views) ----

export interface BufferViewDescriptor {
  bufferView: number
  dtype: 'float32' | 'uint32'
  count: number
  byteOffset?: number
  itemSize?: number
}

// ---- Parsed selector bundle (manifest + typed buffer views) ----

export interface SelectorBundle {
  manifest: SelectorManifest
  buffers: SelectorBuffers
}

export interface SelectorManifest {
  schemaVersion?: number
  profile?: string
  entryKind?: string
  cadRef?: string
  stepPath?: string
  stepHash?: string
  bbox?: BBox
  stats?: Record<string, unknown>
  occurrences?: unknown[][]
  occurrenceColumns?: string[]
  shapes?: unknown[][]
  shapeColumns?: string[]
  faces?: unknown[][]
  faceColumns?: string[]
  edges?: unknown[][]
  edgeColumns?: string[]
  faceProxy?: {
    runsView?: string
    runColumns?: string[]
    positionsView?: string
    indicesView?: string
    idsView?: string
  }
  edgeProxy?: {
    positionsView?: string
    indicesView?: string
    idsView?: string
  }
  relations?: Record<string, unknown>
  buffers?: {
    littleEndian?: boolean
    views?: Record<string, BufferViewDescriptor>
  }
  [key: string]: unknown
}

export interface SelectorBuffers {
  faceRuns?: Uint32Array
  facePositions?: Float32Array
  faceIndices?: Uint32Array
  faceIds?: Uint32Array
  edgePositions?: Float32Array
  edgeIndices?: Uint32Array
  edgeIds?: Uint32Array
  vertexPositions?: Float32Array
  vertexIds?: Uint32Array
  faceEdgeRows?: Uint32Array | number[]
  edgeFaceRows?: Uint32Array | number[]
  [key: string]: Uint32Array | Float32Array | number[] | undefined
}

// ---- Bounding box ----

export interface BBox {
  min: number[]
  max: number[]
}

// ---- Row types (after toRows conversion) ----

export interface OccurrenceRow {
  id: string
  path?: string
  name?: string | null
  sourceName?: string | null
  parentId?: string | null
  transform?: number[]
  bbox?: BBox
  shapeStart?: number
  shapeCount?: number
  faceStart?: number
  faceCount?: number
  edgeStart?: number
  edgeCount?: number
  [key: string]: unknown
}

export interface ShapeRow {
  id: string
  occurrenceId?: string
  kind?: string
  bbox?: BBox
  center?: number[]
  area?: number
  volume?: number
  faceStart?: number
  faceCount?: number
  edgeStart?: number
  edgeCount?: number
  [key: string]: unknown
}

export interface FaceRow {
  id: string
  occurrenceId?: string
  shapeId?: string
  surfaceType?: string
  area?: number
  center?: number[]
  normal?: number[]
  bbox?: BBox
  edgeStart?: number
  edgeCount?: number
  relevance?: string
  flags?: number
  params?: Record<string, unknown>
  triangleStart?: number
  triangleCount?: number
  loopCount?: number
  loops?: number[][][]
  loopsMeta?: Record<string, unknown>[]
  surface?: Record<string, unknown>
  metric?: number
  [key: string]: unknown
}

export interface EdgeRow {
  id: string
  occurrenceId?: string
  shapeId?: string
  curveType?: string
  length?: number
  center?: number[]
  bbox?: BBox
  faceStart?: number
  faceCount?: number
  relevance?: string
  flags?: number
  params?: Record<string, unknown>
  segmentStart?: number
  segmentCount?: number
  [key: string]: unknown
}

// ---- Reference (built per occurrence/shape/face/edge row) ----

export interface Reference {
  id: string
  selectorType: 'occurrence' | 'shape' | 'face' | 'edge' | 'vertex'
  normalizedSelector: string
  displaySelector: string
  label: string
  summary: string
  shortSummary: string
  copyText: string
  partId?: string
  occurrenceId: string
  shapeId: string
  rowIndex: number
  pickData: PickData
}

export interface PickData {
  selectorType: string
  rowIndex: number
  bbox: BBox | null
  center: number[] | null
  normal: number[] | null
  params: Record<string, unknown> | null
  triangleStart: number
  triangleCount: number
  segmentStart: number
  segmentCount: number
  adjacentSelectors: string[]
  transform: number[] | null
  loops?: number[][][]
  loopsMeta?: Record<string, unknown>[]
  surface?: Record<string, unknown>
  loopCount?: number
  metric?: number
  /** For point-mode references: 'vertex' | 'edge-mid' | 'face-center' */
  pointType?: 'vertex' | 'edge-mid' | 'face-center'
  /** Face fields */
  surfaceType?: string
  area?: number
  edgeCount?: number
  /** Edge fields */
  curveType?: string
  length?: number
}

// ---- SelectorRuntime (the fully built runtime object) ----

export interface SelectorRuntime {
  cadPath: string
  stepHash: string
  bbox: BBox | null
  occurrences: OccurrenceRow[]
  shapes: ShapeRow[]
  faces: FaceRow[]
  edges: EdgeRow[]
  vertices: Record<string, unknown>[]
  references: Reference[]
  referenceMap: Map<string, Reference>
  referenceByNormalizedSelector: Map<string, Reference>
  referenceByDisplaySelector: Map<string, Reference>
  faceReferenceByRowIndex: Map<number, Reference>
  edgeReferenceByRowIndex: Map<number, Reference>
  vertexReferenceByRowIndex: Map<number, Reference>
  occurrenceIdByRowIndex: Map<number, string>
  faceReferenceMap: Map<string, Reference>
  edgeReferenceMap: Map<string, Reference>
  vertexReferenceMap: Map<string, Reference>
  singleOccurrenceId: string
  proxy: SelectorProxy
}

export interface SelectorProxy {
  facePositions: Float32Array
  faceIndices: Uint32Array
  faceIds: Uint32Array
  faceRuns: Uint32Array
  faceRunColumns: string[]
  edgePositions: Float32Array
  edgeIndices: Uint32Array
  edgeIds: Uint32Array
  vertexPositions: Float32Array
  vertexIds: Uint32Array
  faceEdgeRows: Uint32Array | number[]
  edgeFaceRows: Uint32Array | number[]
  /** Merged positions for point pick geometry: vertices + edge midpoints + face centers */
  allPointPositions: Float32Array
  /** 0=vertex, 1=edge-mid, 2=face-center */
  allPointTypes: Uint8Array
  /** Source row index into vertex/edge/face tables */
  allPointRefIndices: Uint32Array
  vertexPointCount: number
  edgeMidCount: number
  faceCenterCount: number
}
