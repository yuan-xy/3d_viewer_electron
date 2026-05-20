import { GlbBuilder } from './GlbBuilder';
import type { OcctMesh, OcctNode } from './occtLoader';

// Topology data stays in mm — the viewer's buildSelectorRuntime applies
// a scale=0.001 transform to convert to meters, matching the Python convention.

const OCCURRENCE_COLUMNS = [
  'id', 'path', 'name', 'sourceName', 'parentId', 'transform',
  'bbox', 'shapeStart', 'shapeCount', 'faceStart', 'faceCount',
  'edgeStart', 'edgeCount',
];

const SHAPE_COLUMNS = [
  'id', 'occurrenceId', 'ordinal', 'kind', 'bbox', 'center',
  'area', 'volume', 'faceStart', 'faceCount', 'edgeStart', 'edgeCount',
];

const FACE_COLUMNS = [
  'id', 'occurrenceId', 'shapeId', 'ordinal', 'surfaceType',
  'area', 'center', 'normal', 'bbox', 'edgeStart', 'edgeCount',
  'relevance', 'flags', 'params', 'triangleStart', 'triangleCount',
];

const EDGE_COLUMNS = [
  'id', 'occurrenceId', 'shapeId', 'ordinal', 'curveType',
  'length', 'center', 'bbox', 'faceStart', 'faceCount',
  'relevance', 'flags', 'params', 'segmentStart', 'segmentCount',
];

const IDENTITY_16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

interface AddStepTopologyOptions {
  includeSelectorTopology?: boolean;
  entryKind?: string;
  stepHash?: string;
  cadPath?: string;
}

interface BBox {
  min: number[];
  max: number[];
}

function bboxCenter(bbox: BBox): number[] {
  return [
    (bbox.min[0] + bbox.max[0]) / 2,
    (bbox.min[1] + bbox.max[1]) / 2,
    (bbox.min[2] + bbox.max[2]) / 2,
  ];
}

function faceNormalFromTriangle(
  posArray: Float32Array,
  idxArray: Uint32Array,
  firstTri: number,
): number[] {
  const i0 = idxArray[firstTri * 3];
  const i1 = idxArray[firstTri * 3 + 1];
  const i2 = idxArray[firstTri * 3 + 2];
  const ax = posArray[i1 * 3] - posArray[i0 * 3];
  const ay = posArray[i1 * 3 + 1] - posArray[i0 * 3 + 1];
  const az = posArray[i1 * 3 + 2] - posArray[i0 * 3 + 2];
  const bx = posArray[i2 * 3] - posArray[i0 * 3];
  const by = posArray[i2 * 3 + 1] - posArray[i0 * 3 + 1];
  const bz = posArray[i2 * 3 + 2] - posArray[i0 * 3 + 2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < 1e-12) return [0, 0, 1];
  return [nx / len, ny / len, nz / len];
}

function faceBbox(
  posArray: Float32Array,
  idxArray: Uint32Array,
  firstTri: number,
  lastTri: number,
): BBox {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let t = firstTri; t <= lastTri; t++) {
    for (let j = 0; j < 3; j++) {
      const vi = idxArray[t * 3 + j];
      const x = posArray[vi * 3];
      const y = posArray[vi * 3 + 1];
      const z = posArray[vi * 3 + 2];
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
    }
  }
  return { min, max };
}

function bboxArray(bbox: BBox): number[] {
  return [bbox.min[0], bbox.min[1], bbox.min[2], bbox.max[0], bbox.max[1], bbox.max[2]];
}

function mergeBboxes(bboxes: BBox[]): BBox {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const b of bboxes) {
    if (b.min[0] < min[0]) min[0] = b.min[0];
    if (b.min[1] < min[1]) min[1] = b.min[1];
    if (b.min[2] < min[2]) min[2] = b.min[2];
    if (b.max[0] > max[0]) max[0] = b.max[0];
    if (b.max[1] > max[1]) max[1] = b.max[1];
    if (b.max[2] > max[2]) max[2] = b.max[2];
  }
  return { min, max };
}

interface OcctImportResult {
  root: OcctNode;
  meshes: OcctMesh[];
}

export function addStepTopology(
  builder: GlbBuilder,
  importResult: OcctImportResult,
  {
    includeSelectorTopology = true,
    entryKind = 'part',
    stepHash,
    cadPath,
  }: AddStepTopologyOptions = {},
): void {
  // selector manifest (with proxy geometry)
  let selectorView: number | null = null;
  if (includeSelectorTopology && importResult.meshes.length > 0) {
    const { manifest, buffers } = buildSelectorManifest(builder, importResult, { entryKind, stepHash, cadPath });

    // Write typed buffer views into the GLB and record their view indices
    const bufferViewDefs: Record<string, { dtype: string; bufferView: number; byteLength: number; count: number; itemSize: number }> = {};
    for (const [name, arr] of Object.entries(buffers)) {
      const bufViewIdx = builder.addBufferView(arr);
      const itemSize = arr instanceof Float32Array ? 4 : 4; // Uint32Array also 4 bytes
      bufferViewDefs[name] = {
        dtype: arr instanceof Float32Array ? 'float32' : 'uint32',
        bufferView: bufViewIdx,
        byteOffset: 0,
        byteLength: arr.byteLength,
        count: arr.length,
        itemSize,
      };
    }

    // Patch the manifest with buffer view descriptors
    (manifest as Record<string, unknown>).buffers = {
      littleEndian: true,
      views: bufferViewDefs,
    };

    const selectorPayload = new TextEncoder().encode(JSON.stringify(manifest));
    selectorView = builder.addBufferView(selectorPayload);
  }

  // 3. write extension
  if (!(builder.json.extensionsUsed as string[] | undefined)) {
    (builder.json as Record<string, unknown>).extensionsUsed = [];
  }
  const extUsed = builder.json.extensionsUsed as string[];
  if (!extUsed.includes('STEP_T')) {
    extUsed.push('STEP_T');
  }
  if (!(builder.json as Record<string, unknown>).extensions) {
    (builder.json as Record<string, unknown>).extensions = {};
  }

  (builder.json.extensions as Record<string, unknown>).STEP_T = {
    schemaVersion: 2,
    entryKind,
    encoding: 'utf-8',
    ...(selectorView !== null ? { selectorView } : {}),
  };
}

function buildSelectorManifest(
  _builder: GlbBuilder,
  importResult: OcctImportResult,
  { entryKind: _entryKind, stepHash, cadPath }: AddStepTopologyOptions,
): { manifest: Record<string, unknown>; buffers: Record<string, Float32Array | Uint32Array> } {
  const meshes = importResult.meshes;

  const faceRunData: number[] = [];

  let totalFaces = 0;
  let occIndex = 0;

  const occurrenceRows: unknown[][] = [];
  const shapeRows: unknown[][] = [];
  const faceRows: unknown[][] = [];

  for (let mi = 0; mi < meshes.length; mi++) {
    const mesh = meshes[mi];
    const posArr = new Float32Array(mesh.attributes.position.array);
    const idxArr = new Uint32Array(mesh.index.array);
    const brepFaces = mesh.brep_faces || [];

    const occId = String(occIndex);
    const shapeId = `${occId}.s0`;

    const faceBboxes: BBox[] = [];
    const faceNormals: number[][] = [];

    for (let fi = 0; fi < brepFaces.length; fi++) {
      const face = brepFaces[fi];
      const firstTri = face.first;
      const lastTri = face.last;
      const triCount = lastTri - firstTri + 1;

      // Bbox & normal (in mm, matching Python convention)
      const bbox = faceBbox(posArr, idxArr, firstTri, lastTri);
      faceBboxes.push(bbox);
      faceNormals.push(faceNormalFromTriangle(posArr, idxArr, firstTri));

      // FaceRun references mesh index array directly (matching Python convention)
      faceRunData.push(occIndex, 0, firstTri, triCount, totalFaces + fi);

      const faceId = `${occId}.f${fi}`;
      faceRows.push([
        faceId,
        occId,
        shapeId,
        fi,
        'unknown',
        0,
        bboxCenter(bbox),
        faceNormals[fi],
        bboxArray(bbox),
        0,
        0,
        0,
        0,
        null,
        firstTri,
        triCount,
      ]);
    }

    const meshBbox = faceBboxes.length > 0
      ? mergeBboxes(faceBboxes)
      : { min: [0, 0, 0], max: [0, 0, 0] };

    occurrenceRows.push([
      occId,
      String(occIndex),
      mesh.name,
      mesh.name,
      null,
      IDENTITY_16,
      bboxArray(meshBbox),
      0,
      1,
      totalFaces,
      brepFaces.length,
      0,
      0,
    ]);

    shapeRows.push([
      shapeId,
      occId,
      0,
      'solid',
      bboxArray(meshBbox),
      bboxCenter(meshBbox),
      0,
      0,
      totalFaces,
      brepFaces.length,
      0,
      0,
    ]);

    totalFaces += brepFaces.length;
    occIndex++;
  }

  let globalBbox: BBox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const row of occurrenceRows) {
    const rowBbox = row[6] as number[];
    if (rowBbox[0] < globalBbox.min[0]) globalBbox.min[0] = rowBbox[0];
    if (rowBbox[1] < globalBbox.min[1]) globalBbox.min[1] = rowBbox[1];
    if (rowBbox[2] < globalBbox.min[2]) globalBbox.min[2] = rowBbox[2];
    if (rowBbox[3] > globalBbox.max[0]) globalBbox.max[0] = rowBbox[3];
    if (rowBbox[4] > globalBbox.max[1]) globalBbox.max[1] = rowBbox[4];
    if (rowBbox[5] > globalBbox.max[2]) globalBbox.max[2] = rowBbox[5];
  }
  if (!isFinite(globalBbox.min[0])) {
    globalBbox = { min: [0, 0, 0], max: [0, 0, 0] };
  }

  // Edge data is not available from occt-import-js (WASM module only exposes
  // brep_faces, not brep_edges). STEP topological edges must be extracted from
  // OCCT's TopExp_Explorer / BRepAdaptor_Curve.
  // Until the WASM module is rebuilt with edge support, edge tables and proxy
  // geometry buffers are left empty.
  const manifest: Record<string, unknown> = {
    schemaVersion: 2,
    profile: 'selector',
    cadRef: cadPath,
    stepPath: cadPath ? `${cadPath}.step` : undefined,
    stepHash,
    bbox: [
      globalBbox.min[0], globalBbox.min[1], globalBbox.min[2],
      globalBbox.max[0], globalBbox.max[1], globalBbox.max[2],
    ],
    stats: {
      occurrenceCount: occurrenceRows.length,
      leafOccurrenceCount: occurrenceRows.length,
      shapeCount: shapeRows.length,
      faceCount: totalFaces,
      edgeCount: 0,
      faceProxyRunCount: totalFaces,
      edgeProxyPointCount: 0,
      edgeProxySegmentCount: 0,
    },
    tables: {
      occurrenceColumns: OCCURRENCE_COLUMNS,
      shapeColumns: SHAPE_COLUMNS,
      faceColumns: FACE_COLUMNS,
      edgeColumns: EDGE_COLUMNS,
    },
    occurrences: occurrenceRows,
    shapes: shapeRows,
    faces: faceRows,
    edges: [],
    faceProxy: {
      runsView: 'faceRuns',
      runColumns: ['occurrenceRow', 'primitiveIndex', 'triangleStart', 'triangleCount', 'faceRow'],
    },
    edgeProxy: {
      positionsView: 'edgePositions',
      indicesView: 'edgeIndices',
      edgeIdsView: 'edgeIds',
    },
    relations: {
      faceEdgeRowsView: 'faceEdgeRows',
      edgeFaceRowsView: 'edgeFaceRows',
    },
  };

  const buffers: Record<string, Float32Array | Uint32Array> = {
    faceRuns: new Uint32Array(faceRunData),
    edgePositions: new Float32Array(0),
    edgeIndices: new Uint32Array(0),
    edgeIds: new Uint32Array(0),
    faceEdgeRows: new Uint32Array(0),
    edgeFaceRows: new Uint32Array(0),
  };

  return { manifest, buffers };
}
