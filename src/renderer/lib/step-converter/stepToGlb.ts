import { loadOcct, type OcctMesh, type OcctNode } from './occtLoader';
import { GlbBuilder } from './GlbBuilder';
import { addStepTopology } from './topologyExt';

const CAD_TO_GLB_SCALE = 0.001;
const DEFAULT_MATERIAL = [0.608, 0.651, 0.682, 1.0]; // #9BA6AE — matches createDefaultMaterial()

export interface StepToGlbOptions {
  linearDeflection?: number;
  angularDeflection?: number;
  color?: number[];
  includeSelectorTopology?: boolean;
  entryKind?: string;
  wasmPath?: string;
  stepHash?: string;
  cadPath?: string;
}

interface OcctImportResult {
  success: boolean;
  root: OcctNode;
  meshes: OcctMesh[];
}

export async function stepToGlb(
  stepData: ArrayBuffer | Uint8Array,
  options: StepToGlbOptions = {},
): Promise<ArrayBuffer> {
  const occt = await loadOcct({ wasmPath: options.wasmPath });

  const params = {
    linearUnit: 'millimeter',
    linearDeflectionType: 'absolute_value',
    linearDeflection: options.linearDeflection ?? 0.001,
    angularDeflection: options.angularDeflection ?? 0.5,
  };

  const buffer = stepData instanceof Uint8Array ? stepData : new Uint8Array(stepData);
  const result = occt.ReadStepFile(buffer, params) as OcctImportResult;

  if (!result.success) {
    throw new Error('STEP import failed');
  }

  return buildGlbFromResult(result, options);
}

export async function sha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback
  const { createHash } = await import('crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildGlbFromResult(importResult: OcctImportResult, options: StepToGlbOptions): ArrayBuffer {
  const builder = new GlbBuilder();
  const { color, entryKind = 'part', stepHash, cadPath } = options;

  let nextOccurrenceId = 0;

  function buildNode(occtNode: OcctNode): number | null {
    const childIndices: number[] = [];

    const meshes = occtNode.meshes || [];
    for (const meshIdx of meshes) {
      const occurrenceId = `o${nextOccurrenceId++}`;
      const meshNode = buildNodeForMesh(
        importResult.meshes[meshIdx], builder, { color, occurrenceId },
      );
      childIndices.push(builder.addNode(meshNode));
    }

    for (const childNode of (occtNode.children || [])) {
      const childIdx = buildNode(childNode);
      if (childIdx !== null) {
        childIndices.push(childIdx);
      }
    }

    if (childIndices.length === 0) return null;

    if (childIndices.length === 1) {
      return childIndices[0];
    }

    const idx = builder.addNode({
      name: occtNode.name,
      children: childIndices,
    });
    return idx;
  }

  const rootIdx = buildNode(importResult.root);
  if (rootIdx !== null) {
    builder.setSceneNodes([rootIdx]);
  }

  addStepTopology(builder, importResult, {
    includeSelectorTopology: options.includeSelectorTopology ?? true,
    entryKind,
    stepHash,
    cadPath,
  });

  return builder.write();
}

function buildNodeForMesh(
  mesh: OcctMesh,
  builder: GlbBuilder,
  { color, occurrenceId }: { color?: number[]; occurrenceId: string },
): Record<string, unknown> {
  const posArray = mesh.attributes.position.array;
  const normArray = mesh.attributes.normal?.array;
  const idxArray = mesh.index.array;

  const positions = new Float32Array(posArray.length);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < posArray.length; i += 3) {
    const x = posArray[i]     * CAD_TO_GLB_SCALE;
    const y = posArray[i + 1] * CAD_TO_GLB_SCALE;
    const z = posArray[i + 2] * CAD_TO_GLB_SCALE;
    positions[i]     = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }

  const normals = normArray ? new Float32Array(normArray) : new Float32Array();

  const rawColor = color || mesh.color;
  const matColor = rawColor
    ? [rawColor[0], rawColor[1], rawColor[2], rawColor.length >= 4 ? rawColor[3] : 1.0]
    : DEFAULT_MATERIAL;
  const materialIndex = builder.addMaterial(matColor);

  const indices = new Uint32Array(idxArray);
  const meshIndex = builder.addMesh(positions, normals, [[indices, materialIndex]], min, max, mesh.name);

  return {
    name: occurrenceId,
    mesh: meshIndex,
    extras: {
      cadOccurrenceId: occurrenceId,
      cadName: mesh.name,
    },
  };
}
