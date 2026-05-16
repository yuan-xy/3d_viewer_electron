import type {
  BBox,
  EdgeRow,
  FaceRow,
  OccurrenceRow,
  Reference,
  SelectorBundle,
  SelectorManifest,
  SelectorProxy,
  SelectorRuntime,
  ShapeRow,
} from './types'
import {
  computeEdgeMidpoints,
  computeFaceCenters,
  buildAllPointData,
} from './build-logical-points'

// ---- helpers ----

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

// ---- column → row conversion ----

function toRows<T extends Record<string, unknown>>(
  manifest: SelectorManifest,
  rowKey: string,
  columnsKey: string,
): T[] {
  const tables = (manifest as Record<string, unknown>).tables as Record<string, unknown> | undefined
  const columns = tables?.[columnsKey] as string[] | undefined
  const rows = (manifest as Record<string, unknown>)[rowKey] as unknown[][] | undefined

  if (!Array.isArray(columns) || !Array.isArray(rows)) {
    return []
  }

  return rows
    .filter(Array.isArray)
    .map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])) as unknown as T)
}

// ---- relation array (direct or from buffer view) ----

function relationArray(
  manifest: SelectorManifest,
  buffers: SelectorBundle['buffers'],
  relationKey: string,
  viewKey: string,
): Uint32Array | number[] {
  const relations = manifest.relations as Record<string, unknown> | undefined
  const direct = relations?.[relationKey]
  if (Array.isArray(direct) || ArrayBuffer.isView(direct)) {
    return direct as Uint32Array | number[]
  }
  const viewName = relations?.[viewKey]
  if (typeof viewName === 'string' && buffers[viewName]) {
    return buffers[viewName] as Uint32Array
  }
  return []
}

// ---- typed buffer view lookup by name ----

function typedBufferView(
  manifest: SelectorManifest,
  buffers: SelectorBundle['buffers'],
  sectionKey: string,
  viewKey: string,
): Uint32Array {
  const section = (manifest as Record<string, unknown>)[sectionKey] as Record<string, unknown> | undefined
  const viewName = section?.[viewKey]
  if (typeof viewName === 'string' && buffers[viewName]) {
    return buffers[viewName] as Uint32Array
  }
  return new Uint32Array(0)
}

// ---- selector prefix stripping (for single-occurrence models) ----

function selectorPrefix(singleOccurrenceId: string, selector: string): string {
  if (!singleOccurrenceId || !selector.startsWith(`${singleOccurrenceId}.`)) {
    return selector
  }
  const suffix = selector.slice(singleOccurrenceId.length + 1)
  return suffix.startsWith('s') || suffix.startsWith('f') || suffix.startsWith('e') ? suffix : selector
}

// ---- labels ----

function selectorTypeLabel(selectorType: string): string {
  switch (selectorType) {
    case 'occurrence': return 'Occurrence'
    case 'shape': return 'Shape'
    case 'face': return 'Face'
    case 'edge': return 'Edge'
    case 'vertex': return 'Vertex'
    default: return selectorType
  }
}

// ---- transform helpers ----

function transformPoint(transform: number[], point: number[]): number[] {
  if (!Array.isArray(point) || point.length < 3) return point
  if (!Array.isArray(transform) || transform.length < 16) {
    return [Number(point[0]), Number(point[1]), Number(point[2])]
  }
  const x = Number(point[0])
  const y = Number(point[1])
  const z = Number(point[2])
  return [
    transform[0] * x + transform[1] * y + transform[2] * z + transform[3],
    transform[4] * x + transform[5] * y + transform[6] * z + transform[7],
    transform[8] * x + transform[9] * y + transform[10] * z + transform[11],
  ]
}

function normalizeVector(vector: number[]): number[] | null {
  const x = Number(vector?.[0] || 0)
  const y = Number(vector?.[1] || 0)
  const z = Number(vector?.[2] || 0)
  const magnitude = Math.hypot(x, y, z)
  if (magnitude <= 1e-9) return null
  return [x / magnitude, y / magnitude, z / magnitude]
}

function transformVector(transform: number[], vector: number[]): number[] | null {
  if (!Array.isArray(vector) || vector.length < 3 || !Array.isArray(transform) || transform.length < 16) {
    return normalizeVector(vector || [])
  }
  return normalizeVector([
    transform[0] * vector[0] + transform[1] * vector[1] + transform[2] * vector[2],
    transform[4] * vector[0] + transform[5] * vector[1] + transform[6] * vector[2],
    transform[8] * vector[0] + transform[9] * vector[1] + transform[10] * vector[2],
  ])
}

function normalizeBBox(bbox: unknown): BBox | null {
  if (!bbox) return null
  // Flat array: [xmin, ymin, zmin, xmax, ymax, zmax]
  if (Array.isArray(bbox) && bbox.length >= 6) {
    return { min: [bbox[0], bbox[1], bbox[2]], max: [bbox[3], bbox[4], bbox[5]] }
  }
  if (!isObject(bbox)) return null
  const obj = bbox as Record<string, unknown>
  const min = Array.isArray(obj.min) ? obj.min : [0, 0, 0]
  const max = Array.isArray(obj.max) ? obj.max : [0, 0, 0]
  return { min, max }
}

function transformBBox(transform: number[], bbox: BBox | null): BBox | null {
  // Normalize flat-array bboxes before transforming
  const bboxObj = normalizeBBox(bbox)
  if (!bboxObj) return null
  const min = bboxObj.min
  const max = bboxObj.max
  const corners = [
    [min[0], min[1], min[2]],
    [min[0], min[1], max[2]],
    [min[0], max[1], min[2]],
    [min[0], max[1], max[2]],
    [max[0], min[1], min[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], min[2]],
    [max[0], max[1], max[2]],
  ].map((p) => transformPoint(transform, p))
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  const zs = corners.map((p) => p[2])
  return {
    min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
    max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
  }
}

function transformParams(transform: number[], params: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!isObject(params)) return params

  const pointKeys = new Set(['origin', 'center', 'location'])
  const vectorKeys = new Set(['axis', 'direction', 'normal'])

  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (pointKeys.has(key) && Array.isArray(value) && value.length === 3) {
        return [key, transformPoint(transform, value as number[])]
      }
      if (vectorKeys.has(key) && Array.isArray(value) && value.length === 3) {
        return [key, transformVector(transform, value as number[])]
      }
      return [key, value]
    }),
  )
}

function transformRows<T extends Record<string, unknown>>(rows: T[], transform: number[] | null): T[] {
  if (!Array.isArray(transform) || transform.length < 16) return rows

  return rows.map((row) => ({
    ...row,
    transform: Array.isArray(row.transform) ? row.transform : transform,
    bbox: row.bbox ? transformBBox(transform, row.bbox as BBox) : row.bbox,
    center: Array.isArray(row.center) ? transformPoint(transform, row.center as number[]) : row.center,
    normal: Array.isArray(row.normal) ? transformVector(transform, row.normal as number[]) : row.normal,
    params: row.params ? transformParams(transform, row.params as Record<string, unknown>) : row.params,
  }))
}

// ---- relation start fixup (face/edge table sequential offsets) ----

function applySequentialRelationStarts<T extends Record<string, unknown>>(
  rows: T[],
  relationSpecs: [string, string][],
): T[] {
  const specs = Array.isArray(relationSpecs[0]) ? relationSpecs : [relationSpecs]
  const nextStarts = specs.map(() => 0)

  return rows.map((row) => {
    const nextRow = { ...row } as Record<string, unknown>
    const rowRec = row as Record<string, unknown>
    for (let i = 0; i < specs.length; i++) {
      const startKey = specs[i][0] as string
      const countKey = specs[i][1] as string
      const count = Math.max(0, Number(rowRec[countKey] || 0))
      nextRow[startKey] = nextStarts[i]
      nextRow[countKey] = count
      nextStarts[i] += count
    }
    return nextRow as T
  })
}

// ---- transform proxy positions ----

function transformPositions(values: Float32Array | Uint32Array, transform: number[] | null): Float32Array {
  if (!(values instanceof Float32Array) || !Array.isArray(transform) || transform.length < 16) {
    return values as Float32Array
  }

  const next = new Float32Array(values.length)
  for (let i = 0; i < values.length; i += 3) {
    const point = transformPoint(transform, [values[i], values[i + 1], values[i + 2]])
    next[i] = point[0]
    next[i + 1] = point[1]
    next[i + 2] = point[2]
  }
  return next
}

// ---- selectors ----

function selectorForRow(
  _selectorType: string,
  row: Record<string, unknown> | undefined,
  rowIndex: number,
  singleOccurrenceId: string,
): string {
  if (!row || !Number.isFinite(Number(rowIndex))) return ''

  return selectorPrefix(singleOccurrenceId, String(row.id || '').trim())
}

// ---- adjacency ----

function buildAdjacencySelectors(
  row: Record<string, unknown>,
  relationRows: Uint32Array | number[],
  targetRows: Record<string, unknown>[],
  singleOccurrenceId: string,
  idKey: string,
  startKey: string,
  countKey: string,
): string[] {
  const start = Number(row[startKey] || 0)
  const count = Number(row[countKey] || 0)
  const selectors: string[] = []
  const end = Math.min(relationRows.length, start + count)

  for (let i = start; i < end; i++) {
    const targetRowIndex = Number(relationRows[i])
    const targetRow = targetRows[targetRowIndex]
    const selector =
      selectorForRow('', targetRow, targetRowIndex, singleOccurrenceId) ||
      String(targetRow?.[idKey] || '').trim()
    if (selector) selectors.push(selector)
  }

  return selectors
}

// ---- build a single Reference ----

function buildReference({
  selectorType,
  row,
  rowIndex,
  singleOccurrenceId,
  selectorTransform,
  partId,
  relationRows,
  targetRows,
  targetKey,
  startKey,
  countKey,
}: {
  selectorType: Reference['selectorType']
  row: Record<string, unknown>
  rowIndex: number
  singleOccurrenceId: string
  selectorTransform: number[] | null
  partId?: string
  relationRows?: Uint32Array | number[]
  targetRows?: Record<string, unknown>[]
  targetKey?: string
  startKey?: string
  countKey?: string
}): Reference {
  const normalizedSelector = selectorForRow(selectorType, row, rowIndex, singleOccurrenceId)
  const displaySelector = normalizedSelector
  const label = `${selectorTypeLabel(selectorType)} ${displaySelector}`
  const summary = referenceSummary(selectorType, row)
  const id = `topology|${partId || ''}|${selectorType}|${displaySelector}`

  const adjacentSelectors =
    relationRows && targetRows && startKey && countKey && targetKey
      ? buildAdjacencySelectors(
          row,
          relationRows,
          targetRows,
          singleOccurrenceId,
          targetKey,
          startKey,
          countKey,
        )
      : []

  return {
    id,
    selectorType,
    normalizedSelector,
    displaySelector,
    label,
    summary,
    shortSummary: summary,
    copyText: summary ? `${displaySelector} ${summary}` : displaySelector,
    partId,
    occurrenceId: row.occurrenceId ? selectorPrefix(singleOccurrenceId, String(row.occurrenceId)) : '',
    shapeId: row.shapeId ? selectorPrefix(singleOccurrenceId, String(row.shapeId)) : '',
    rowIndex,
    pickData: {
      selectorType,
      rowIndex,
      bbox: (row.bbox as BBox) || null,
      center: (row.center as number[]) || null,
      normal: (row.normal as number[]) || null,
      params: (row.params as Record<string, unknown>) || null,
      triangleStart: (row.triangleStart as number) ?? 0,
      triangleCount: (row.triangleCount as number) ?? 0,
      segmentStart: (row.segmentStart as number) ?? 0,
      segmentCount: (row.segmentCount as number) ?? 0,
      adjacentSelectors,
      transform: selectorTransform || null,
      loops: row.loops as number[][][] | undefined,
      loopsMeta: row.loopsMeta as Record<string, unknown>[] | undefined,
      surface: row.surface as Record<string, unknown> | undefined,
      loopCount: row.loopCount as number | undefined,
      metric: row.metric as number | undefined,
      pointType: row.pointType as 'vertex' | 'edge-mid' | 'face-center' | undefined,
      surfaceType: row.surfaceType as string | undefined,
      area: row.area as number | undefined,
      edgeCount: row.edgeCount as number | undefined,
      curveType: row.curveType as string | undefined,
      length: row.length as number | undefined,
    },
  }
}

function referenceSummary(selectorType: string, row: Record<string, unknown>): string {
  switch (selectorType) {
    case 'occurrence':
      return String(row.name || row.sourceName || row.id || '').trim()
    case 'shape':
      return `${row.kind || 'shape'}${row.volume ? ` volume=${row.volume}` : row.area ? ` area=${row.area}` : ''}`
    case 'face':
      return `${row.surfaceType || 'face'} area=${row.area ?? 0}`
    case 'edge':
      return `${row.curveType || 'edge'} length=${row.length ?? 0}`
    case 'vertex':
      return `vertex`
    default:
      return ''
  }
}

// ---- leaf occurrence ids (for single-occurrence detection) ----

function buildLeafOccurrenceIds(shapes: ShapeRow[]): string[] {
  return [
    ...new Set(shapes.map((row) => String(row.occurrenceId || '').trim()).filter(Boolean)),
  ].sort()
}

// ---- vertex extraction from edge endpoints ----

/**
 * Extract unique vertices from edge line-segment endpoint positions.
 * Used as a fallback when the GLB topology extension does not include a
 * dedicated vertexPositions buffer (common in simple models).
 *
 * Each edge is defined by 2 endpoint indices into edgePositions, so we
 * walk edgeIndices and collect the referenced positions, deduplicating
 * by a spatial tolerance.
 */
export function extractVerticesFromEdges(
  edgePositions: Float32Array,
  edgeIndices: Uint32Array,
  tolerance: number = 1e-6,
): { positions: Float32Array; ids: Uint32Array } {
  if (edgePositions.length === 0 || edgeIndices.length === 0) {
    return { positions: new Float32Array(0), ids: new Uint32Array(0) }
  }

  const keyToIndex = new Map<string, number>()
  const uniquePositions: number[] = []

  const round = (v: number) => Math.round(v / tolerance) * tolerance

  for (let i = 0; i < edgeIndices.length; i++) {
    const vi = edgeIndices[i] * 3
    if (vi + 2 >= edgePositions.length) continue
    const x = edgePositions[vi]
    const y = edgePositions[vi + 1]
    const z = edgePositions[vi + 2]
    const key = `${round(x)},${round(y)},${round(z)}`
    if (!keyToIndex.has(key)) {
      keyToIndex.set(key, uniquePositions.length / 3)
      uniquePositions.push(x, y, z)
    }
  }

  const positions = new Float32Array(uniquePositions)
  const ids = new Uint32Array(positions.length / 3)
  for (let i = 0; i < ids.length; i++) ids[i] = i
  return { positions, ids }
}

// ---- main entry ----

export function buildSelectorRuntime(
  bundle: SelectorBundle,
  options: {
    partId?: string
    transform?: number[] | null
    /** Scale factor for STEP topology positions (default 0.001 = mm→m).
     *  STEP data is authored in mm; GLB mesh data is in meters. */
    scale?: number
  } = {},
): SelectorRuntime {
  const { manifest, buffers } = bundle
  const { partId = '', transform = null, scale = 0.001 } = options

  // Build a combined transform that includes the mm→m scale factor.
  // STEP topology data is authored in mm; GLB mesh data is in meters.
  const effectiveTransform = (() => {
    if (scale === 1 && !transform) return null
    const m = Array.isArray(transform) && transform.length >= 16
      ? [...transform]
      : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    if (scale !== 1) {
      m[0] *= scale; m[5] *= scale; m[10] *= scale
    }
    return m
  })()

  const faceRelations = relationArray(manifest, buffers, 'faceEdgeRows', 'faceEdgeRowsView')
  const edgeRelations = relationArray(manifest, buffers, 'edgeFaceRows', 'edgeFaceRowsView')

  const occurrences = transformRows(toRows<OccurrenceRow>(manifest, 'occurrences', 'occurrenceColumns'), effectiveTransform)
  const shapes = transformRows(toRows<ShapeRow>(manifest, 'shapes', 'shapeColumns'), effectiveTransform)

  const faces = applySequentialRelationStarts(
    transformRows(toRows<FaceRow>(manifest, 'faces', 'faceColumns'), effectiveTransform),
    [['edgeStart', 'edgeCount']],
  )

  const edges = applySequentialRelationStarts(
    transformRows(toRows<EdgeRow>(manifest, 'edges', 'edgeColumns'), effectiveTransform),
    [['faceStart', 'faceCount']],
  )

  const leafOccurrenceIds = buildLeafOccurrenceIds(shapes)
  const singleOccurrenceId = leafOccurrenceIds.length === 1 ? leafOccurrenceIds[0] : ''

  // Build proxy from buffers. Some buffers are resolved indirectly through
  // faceProxy/edgeProxy view names (e.g. manifest.edgeProxy.positionsView = "edgePositions"
  // → buffers["edgePositions"]).
  const rawEdgePositions = typedBufferView(manifest, buffers, 'edgeProxy', 'positionsView')
  const vertexPositions = buffers.vertexPositions ?? new Float32Array(0)
  const vertexIds = buffers.vertexIds ?? new Uint32Array(0)
  const proxy: SelectorProxy = {
    facePositions: buffers.facePositions ?? new Float32Array(0),
    faceIndices: buffers.faceIndices ?? new Uint32Array(0),
    faceIds: buffers.faceIds ?? new Uint32Array(0),
    faceRuns: typedBufferView(manifest, buffers, 'faceProxy', 'runsView'),
    faceRunColumns: Array.isArray(manifest.faceProxy?.runColumns) ? manifest.faceProxy!.runColumns! : [],
    edgePositions: transformPositions(rawEdgePositions, effectiveTransform),
    edgeIndices: typedBufferView(manifest, buffers, 'edgeProxy', 'indicesView'),
    edgeIds: typedBufferView(manifest, buffers, 'edgeProxy', 'edgeIdsView'),
    vertexPositions: transformPositions(vertexPositions, effectiveTransform),
    vertexIds,
    faceEdgeRows: faceRelations,
    edgeFaceRows: edgeRelations,
    allPointPositions: new Float32Array(0),
    allPointTypes: new Uint8Array(0),
    allPointRefIndices: new Uint32Array(0),
    vertexPointCount: 0,
    edgeMidCount: 0,
    faceCenterCount: 0,
  }

  // Transform face positions for the proxy
  if (effectiveTransform) {
    proxy.facePositions = transformPositions(proxy.facePositions, effectiveTransform)
  }

  // Fallback: when the GLB extension has no vertexPositions buffer (common
  // in simple models), extract unique vertices from edge endpoint data.
  if (
    proxy.vertexPositions.length === 0 &&
    proxy.edgePositions.length > 0 &&
    proxy.edgeIndices.length > 0
  ) {
    const extracted = extractVerticesFromEdges(proxy.edgePositions, proxy.edgeIndices)
    proxy.vertexPositions = extracted.positions
    proxy.vertexIds = extracted.ids
  }

  // Compute logical points — edge midpoints and face centers.
  const edgeCount = edges.length
  const faceCount = faces.length
  const edgeSegmentStarts = edges.map((e) => (typeof e.segmentStart === 'number' ? e.segmentStart : 0))
  const edgeSegmentCounts = edges.map((e) => (typeof e.segmentCount === 'number' ? e.segmentCount : 1))
  const edgeMidpoints = computeEdgeMidpoints(
    proxy.edgePositions, proxy.edgeIndices, edgeSegmentStarts, edgeSegmentCounts, edgeCount,
  )
  const faceCenters = computeFaceCenters(
    proxy.facePositions,
    proxy.faceIndices,
    proxy.faceRuns,
    proxy.faceRunColumns.length || 5,
    faceCount,
  )
  // Fallback: when face proxy triangle data is absent (SELECTOR profile),
  // use the face row center fields (already transformed by transformRows).
  let effectiveFaceCenters = faceCenters
  if (faceCenters.length === 0 && faceCount > 0) {
    const rowCenters = new Float32Array(faceCount * 3)
    let hasAny = false
    for (let i = 0; i < faceCount; i++) {
      const c = faces[i].center
      if (Array.isArray(c) && c.length >= 3) {
        rowCenters[i * 3] = c[0]
        rowCenters[i * 3 + 1] = c[1]
        rowCenters[i * 3 + 2] = c[2]
        hasAny = true
      }
    }
    if (hasAny) effectiveFaceCenters = rowCenters
  }
  const effectiveFaceCenterCount = effectiveFaceCenters.length > 0 ? faceCount : 0

  // Merge vertices + edge midpoints + face centers into allPointData.
  const vertexCount = proxy.vertexPositions.length / 3
  const pointData = buildAllPointData({
    vertexPositions: proxy.vertexPositions,
    vertexIds: proxy.vertexIds,
    edgeMidpoints,
    faceCenters: effectiveFaceCenters,
    vertexCount,
    edgeCount,
    faceCount: effectiveFaceCenterCount,
  })
  proxy.allPointPositions = pointData.allPointPositions
  proxy.allPointTypes = pointData.allPointTypes
  proxy.allPointRefIndices = pointData.allPointRefIndices
  proxy.vertexPointCount = pointData.vertexPointCount
  proxy.edgeMidCount = pointData.edgeMidCount
  proxy.faceCenterCount = pointData.faceCenterCount

  // Build references
  const references: Reference[] = []

  references.push(
    ...occurrences.map((row, i) =>
      buildReference({ selectorType: 'occurrence', row, rowIndex: i, singleOccurrenceId, selectorTransform: effectiveTransform, partId }),
    ),
  )

  references.push(
    ...shapes.map((row, i) =>
      buildReference({ selectorType: 'shape', row, rowIndex: i, singleOccurrenceId, selectorTransform: effectiveTransform, partId }),
    ),
  )

  references.push(
    ...faces.map((row, i) =>
      buildReference({
        selectorType: 'face',
        row,
        rowIndex: i,
        singleOccurrenceId,
        selectorTransform: effectiveTransform,
        partId,
        relationRows: faceRelations,
        targetRows: edges as unknown as Record<string, unknown>[],
        targetKey: 'id',
        startKey: 'edgeStart',
        countKey: 'edgeCount',
      }),
    ),
  )

  references.push(
    ...edges.map((row, i) =>
      buildReference({
        selectorType: 'edge',
        row,
        rowIndex: i,
        singleOccurrenceId,
        selectorTransform: effectiveTransform,
        partId,
        relationRows: edgeRelations,
        targetRows: faces as unknown as Record<string, unknown>[],
        targetKey: 'id',
        startKey: 'faceStart',
        countKey: 'faceCount',
      }),
    ),
  )

  // Build vertex references from position data.
  // Each vertex has a position (3 floats) and an optional ID.
  // Use proxy.vertexPositions/vertexIds — they may have been populated by
  // the edge-endpoint fallback above.
  const vertexRows: Record<string, unknown>[] = []
  for (let i = 0; i < vertexCount; i++) {
    const id = i < proxy.vertexIds.length ? String(proxy.vertexIds[i]) : `v${i}`
    vertexRows.push({
      id,
      occurrenceId: singleOccurrenceId || undefined,
      center: [proxy.vertexPositions[i * 3], proxy.vertexPositions[i * 3 + 1], proxy.vertexPositions[i * 3 + 2]],
      bbox: null,
    })
  }

  references.push(
    ...vertexRows.map((row, i) =>
      buildReference({
        selectorType: 'vertex',
        row: { ...row, pointType: 'vertex' },
        rowIndex: i,
        singleOccurrenceId,
        selectorTransform: effectiveTransform,
        partId,
      }),
    ),
  )

  // Edge midpoints as vertex-type references (for point selection mode)
  for (let i = 0; i < edgeCount; i++) {
    const rowIndex = vertexCount + i
    references.push(
      buildReference({
        selectorType: 'vertex',
        row: {
          id: `em${i}`,
          occurrenceId: singleOccurrenceId || undefined,
          center: [edgeMidpoints[i * 3], edgeMidpoints[i * 3 + 1], edgeMidpoints[i * 3 + 2]],
          bbox: null,
          pointType: 'edge-mid',
        },
        rowIndex,
        singleOccurrenceId,
        selectorTransform: effectiveTransform,
        partId,
      }),
    )
  }

  // Face centers as vertex-type references (for point selection mode)
  const faceCenterRowOffset = vertexCount + edgeCount
  for (let i = 0; i < effectiveFaceCenterCount; i++) {
    const rowIndex = faceCenterRowOffset + i
    references.push(
      buildReference({
        selectorType: 'vertex',
        row: {
          id: `fc${i}`,
          occurrenceId: singleOccurrenceId || undefined,
          center: [effectiveFaceCenters[i * 3], effectiveFaceCenters[i * 3 + 1], effectiveFaceCenters[i * 3 + 2]],
          bbox: null,
          pointType: 'face-center',
        },
        rowIndex,
        singleOccurrenceId,
        selectorTransform: effectiveTransform,
        partId,
      }),
    )
  }

  const visibleReferences = references.filter((ref) => String(ref.normalizedSelector || '').trim())
  const referenceMap = new Map(visibleReferences.map((ref) => [ref.id, ref]))
  const referenceByNormalizedSelector = new Map(visibleReferences.map((ref) => [ref.normalizedSelector, ref]))
  const referenceByDisplaySelector = new Map(visibleReferences.map((ref) => [ref.displaySelector, ref]))

  const faceReferenceByRowIndex = new Map(
    visibleReferences.filter((ref) => ref.selectorType === 'face').map((ref) => [ref.rowIndex, ref]),
  )
  const edgeReferenceByRowIndex = new Map(
    visibleReferences.filter((ref) => ref.selectorType === 'edge').map((ref) => [ref.rowIndex, ref]),
  )

  const occurrenceIdByRowIndex = new Map(
    occurrences.map((row, i) => [
      i,
      selectorForRow('occurrence', row, i, singleOccurrenceId) || String(row.id || '').trim(),
    ]),
  )

  const rawBbox = manifest.bbox
  const normalizedBbox = normalizeBBox(rawBbox)

  return {
    cadPath: String(manifest.cadRef || '').trim(),
    stepHash: String(manifest.stepHash || ''),
    bbox: normalizedBbox
      ? (effectiveTransform ? transformBBox(effectiveTransform, normalizedBbox) : normalizedBbox)
      : null,
    occurrences,
    shapes,
    faces: faces,
    edges,
    vertices: vertexRows,
    references: visibleReferences,
    referenceMap,
    referenceByNormalizedSelector,
    referenceByDisplaySelector,
    faceReferenceByRowIndex,
    edgeReferenceByRowIndex,
    vertexReferenceByRowIndex: new Map(
      visibleReferences.filter((ref) => ref.selectorType === 'vertex').map((ref) => [ref.rowIndex, ref]),
    ),
    occurrenceIdByRowIndex,
    faceReferenceMap: new Map(
      visibleReferences.filter((ref) => ref.selectorType === 'face').map((ref) => [ref.id, ref]),
    ),
    edgeReferenceMap: new Map(
      visibleReferences.filter((ref) => ref.selectorType === 'edge').map((ref) => [ref.id, ref]),
    ),
    vertexReferenceMap: new Map(
      visibleReferences.filter((ref) => ref.selectorType === 'vertex').map((ref) => [ref.id, ref]),
    ),
    singleOccurrenceId,
    proxy,
  }
}
