/**
 * CLI: STEP → GLB conversion via the production buildGlbFromResult pipeline.
 *
 * Usage:
 *   npx tsx scripts/step-to-glb.ts <input.step> [output.glb]
 *
 * If output path is omitted, the GLB is written next to the input file with
 * the same basename + ".step.glb" extension.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, basename, extname } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const PROJECT_ROOT = process.cwd()

// ── Resolve paths ──

const stepArg = process.argv[2]
if (!stepArg) {
  console.error('Usage: npx tsx scripts/step-to-glb.ts <input.step> [output.glb]')
  process.exit(1)
}

const stepPath = resolve(stepArg)
if (!existsSync(stepPath)) {
  console.error(`File not found: ${stepPath}`)
  process.exit(1)
}

const glbPath = process.argv[3]
  ? resolve(process.argv[3])
  : resolve(dirname(stepPath), basename(stepPath, extname(stepPath)) + '.step.glb')

// ── Bootstrap OCCT (same as production, Node-compatible) ──

console.log('Initializing OCCT WASM...')
const cjsPath = resolve(PROJECT_ROOT, 'src/renderer/public/wasm/occt-import-js.cjs')
globalThis.occtimportjs = require(cjsPath)

const wasmPathAbs = resolve(PROJECT_ROOT, 'src/renderer/public/wasm/occt-import-js.wasm')
const wasmBuffer = readFileSync(wasmPathAbs)
const wasmBinary = wasmBuffer.buffer.slice(
  wasmBuffer.byteOffset,
  wasmBuffer.byteOffset + wasmBuffer.byteLength,
) as ArrayBuffer

const occtInit = globalThis.occtimportjs as unknown as (
  config: { wasmBinary: ArrayBuffer; locateFile: (path: string) => string },
) => Promise<{ ReadStepFile(buf: Uint8Array, params: Record<string, unknown>): unknown }>

const occt = await occtInit({
  wasmBinary,
  locateFile: () => '',
})

// ── Read STEP ──

console.log(`Reading: ${stepPath}`)
const stepBuf = readFileSync(stepPath)
const stepData = new Uint8Array(stepBuf.buffer, stepBuf.byteOffset, stepBuf.byteLength)
console.log(`  ${stepData.byteLength} bytes`)

// ── OCCT import (same params as production) ──

const params = {
  linearUnit: 'millimeter',
  linearDeflectionType: 'absolute_value',
  linearDeflection: 0.001,
  angularDeflection: 0.5,
}

const result = occt.ReadStepFile(stepData, params) as {
  success: boolean
  root: { name: string; meshes: number[]; children: unknown[] }
  meshes: Array<{
    name: string
    attributes: { position: { array: Float32Array }; normal?: { array: Float32Array } }
    index: { array: Uint32Array }
    brep_faces?: Array<{ first: number; last: number }>
  }>
}

if (!result.success) {
  console.error('STEP import failed')
  process.exit(1)
}

console.log(`  Meshes: ${result.meshes.length}`)
console.log(`  brep_faces: ${result.meshes.map((m) => m.brep_faces?.length ?? 0).join(', ')}`)

// ── Build GLB via the PRODUCTION pipeline ──

const stepToGlbUrl = pathToFileURL(
  resolve(PROJECT_ROOT, 'src/renderer/lib/step-converter/stepToGlb.ts'),
).href
const { buildGlbFromResult } = await import(stepToGlbUrl)

const glbBuffer = buildGlbFromResult(result, {
  includeSelectorTopology: true,
  entryKind: 'part',
})

console.log(`  GLB: ${glbBuffer.byteLength} bytes`)

// ── Verify STEP_topology ──

const dv = new DataView(glbBuffer)
const jsonLen = dv.getUint32(12, true)
const jsonBytes = new Uint8Array(glbBuffer, 20, jsonLen)
let end = jsonLen
while (end > 0 && jsonBytes[end - 1] === 0x20) end--
const gltf = JSON.parse(new TextDecoder().decode(jsonBytes.slice(0, end)))

const ext = gltf.extensions?.STEP_topology as Record<string, unknown> | undefined
if (ext) {
  const chunkOff = 20 + jsonLen + ((4 - (jsonLen % 4)) % 4)
  const binOff = chunkOff + 8
  const views = gltf.bufferViews as Array<{ byteOffset: number; byteLength: number }>
  const selView = views[ext.selectorView as number]
  const selBytes = new Uint8Array(glbBuffer, binOff + selView.byteOffset, selView.byteLength)
  const sel = JSON.parse(new TextDecoder().decode(selBytes))

  console.log(`  STEP_topology: ${sel.occurrences.length} occurrences, ${sel.faces.length} faces, ${sel.edges.length} edges`)
  console.log(`  bbox: min=[${(sel.bbox.min as number[]).map((v: number) => v.toFixed(3)).join(', ')}] max=[${(sel.bbox.max as number[]).map((v: number) => v.toFixed(3)).join(', ')}]`)
} else {
  console.error('  WARNING: STEP_topology NOT present in output!')
}

// ── Write ──

writeFileSync(glbPath, new Uint8Array(glbBuffer))
console.log(`\nSaved: ${glbPath}`)
