const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;

const FLOAT = 5126;
const UNSIGNED_INT = 5125;
const VEC3 = 'VEC3';
const SCALAR = 'SCALAR';
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

export class GlbBuilder {
  json: Record<string, unknown>;
  private binary: Uint8Array;
  private binaryOffset: number;

  constructor() {
    this.json = {
      asset: { version: '2.0', generator: 'faicad-step-converter' },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
      meshes: [],
      materials: [],
      buffers: [{ byteLength: 0 }],
      bufferViews: [],
      accessors: [],
    };
    this.binary = new Uint8Array(65536);
    this.binaryOffset = 0;
  }

  private grow(neededSize: number): void {
    const newSize = Math.max(this.binary.length * 2, neededSize);
    const newBuf = new Uint8Array(newSize);
    newBuf.set(this.binary);
    this.binary = newBuf;
  }

  private ensureCapacity(additionalBytes: number): void {
    const needed = this.binaryOffset + additionalBytes;
    if (needed > this.binary.length) {
      this.grow(needed);
    }
  }

  private align4(): void {
    while (this.binaryOffset % 4 !== 0) {
      this.binary[this.binaryOffset++] = 0;
    }
  }

  addBufferView(payload: ArrayBuffer | ArrayBufferView, target: number | null = null): number {
    this.align4();
    const offset = this.binaryOffset;
    const len = (payload as { byteLength?: number }).byteLength ?? (payload as { length: number }).length;
    this.ensureCapacity(len);
    const src = ArrayBuffer.isView(payload)
      ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
      : new Uint8Array(payload as ArrayBuffer);
    this.binary.set(src, offset);
    this.binaryOffset += len;
    this.align4();

    const viewIndex = (this.json.bufferViews as Array<Record<string, unknown>>).length;
    const view: Record<string, unknown> = { buffer: 0, byteOffset: offset, byteLength: len };
    if (target !== null) view.target = target;
    (this.json.bufferViews as Array<Record<string, unknown>>).push(view);
    return viewIndex;
  }

  addAccessor(
    values: Float32Array | Uint32Array,
    componentType: number,
    type: string,
    target: number,
    count: number,
    min?: number[],
    max?: number[],
  ): number {
    const viewIndex = this.addBufferView(values, target);
    const accessor: Record<string, unknown> = {
      bufferView: viewIndex,
      byteOffset: 0,
      componentType,
      count,
      type,
    };
    if (min) accessor.min = min;
    if (max) accessor.max = max;
    (this.json.accessors as Array<Record<string, unknown>>).push(accessor);
    return (this.json.accessors as Array<Record<string, unknown>>).length - 1;
  }

  addMaterial(color: number[], metallicFactor = 0.0, roughnessFactor = 0.55): number {
    (this.json.materials as Array<Record<string, unknown>>).push({
      pbrMetallicRoughness: {
        baseColorFactor: [color[0], color[1], color[2], color[3]],
        metallicFactor,
        roughnessFactor,
      },
      doubleSided: true,
    });
    return (this.json.materials as Array<unknown>).length - 1;
  }

  addMesh(
    positions: Float32Array,
    normals: Float32Array,
    primitives: Array<[Uint32Array, number]>,
    min: number[],
    max: number[],
    name: string,
  ): number | null {
    const vertexCount = positions.length / 3;
    if (vertexCount === 0) return null;

    const posAcc = this.addAccessor(
      new Float32Array(positions), FLOAT, VEC3, ARRAY_BUFFER, vertexCount, min, max,
    );
    let normAcc: number | null = null;
    if (normals.length === positions.length) {
      normAcc = this.addAccessor(
        new Float32Array(normals), FLOAT, VEC3, ARRAY_BUFFER, vertexCount,
      );
    }

    const meshPrims = primitives.map(([indices, mat]) => ({
      attributes: {
        POSITION: posAcc,
        ...(normAcc !== null ? { NORMAL: normAcc } : {}),
      },
      indices: this.addAccessor(
        new Uint32Array(indices), UNSIGNED_INT, SCALAR, ELEMENT_ARRAY_BUFFER, indices.length,
      ),
      material: mat,
      mode: 4,
    }));

    (this.json.meshes as Array<Record<string, unknown>>).push({ name, primitives: meshPrims });
    return (this.json.meshes as Array<unknown>).length - 1;
  }

  addNode(node: Record<string, unknown>): number {
    (this.json.nodes as Array<Record<string, unknown>>).push(node);
    return (this.json.nodes as Array<unknown>).length - 1;
  }

  setSceneNodes(nodeIndices: number[]): void {
    ((this.json.scenes as Array<Record<string, unknown>>)[0]).nodes = nodeIndices;
  }

  write(): ArrayBuffer {
    (this.json.buffers as Array<{ byteLength: number }>)[0].byteLength = this.binaryOffset;

    const jsonStr = JSON.stringify(this.json);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
    const jsonPadded = new Uint8Array(jsonBytes.length + jsonPadding);
    jsonPadded.set(jsonBytes);
    for (let i = 0; i < jsonPadding; i++) {
      jsonPadded[jsonBytes.length + i] = 0x20;
    }

    const binData = this.binary.slice(0, this.binaryOffset);
    const binPadding = (4 - (binData.length % 4)) % 4;
    const binPadded = new Uint8Array(binData.length + binPadding);
    binPadded.set(binData);

    const totalLen = 12 + 8 + jsonPadded.length + 8 + binPadded.length;

    const header = new ArrayBuffer(12);
    const hView = new DataView(header);
    hView.setUint32(0, GLB_MAGIC, true);
    hView.setUint32(4, GLB_VERSION, true);
    hView.setUint32(8, totalLen, true);

    const jsonChunkHeader = new ArrayBuffer(8);
    const jView = new DataView(jsonChunkHeader);
    jView.setUint32(0, jsonPadded.length, true);
    jView.setUint32(4, 0x4E4F534A, true);

    const binChunkHeader = new ArrayBuffer(8);
    const bView = new DataView(binChunkHeader);
    bView.setUint32(0, binPadded.length, true);
    bView.setUint32(4, 0x004E4942, true);

    const result = new Uint8Array(totalLen);
    let pos = 0;
    result.set(new Uint8Array(header), pos); pos += 12;
    result.set(new Uint8Array(jsonChunkHeader), pos); pos += 8;
    result.set(jsonPadded, pos); pos += jsonPadded.length;
    result.set(new Uint8Array(binChunkHeader), pos); pos += 8;
    result.set(binPadded, pos);

    return result.buffer;
  }
}
