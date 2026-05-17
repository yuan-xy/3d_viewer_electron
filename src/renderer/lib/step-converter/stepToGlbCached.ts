import { buildGlbFromResult, type StepToGlbOptions } from './stepToGlb'
import { convertInWorker } from './stepWorkerPool'
import { getCached, putCached } from './stepCache'

const memCache = new Map<string, ArrayBuffer>()

function cacheKey(filePath: string, mtimeMs: number): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedTime = Math.trunc(mtimeMs)
  const key = `${normalizedPath}|${normalizedTime}`
  console.log('[stepToGlbCached] key built:', JSON.stringify({
    rawPath: filePath,
    rawMtimeMs: mtimeMs,
    rawMtimeType: typeof mtimeMs,
    normalizedPath,
    normalizedTime,
  }))
  return key
}

const OCCT_PARAMS = {
  linearUnit: 'millimeter',
  linearDeflectionType: 'absolute_value',
  linearDeflection: 0.001,
  angularDeflection: 0.5,
}

export async function stepToGlbCached(
  stepData: ArrayBuffer | Uint8Array,
  fileInfo: { filePath: string; mtimeMs: number },
  options: StepToGlbOptions = {},
): Promise<{ buffer: ArrayBuffer; cached: boolean }> {
  const key = cacheKey(fileInfo.filePath, fileInfo.mtimeMs)
  const startTime = performance.now()

  // 1. In-memory cache (instant for repeat loads within session)
  const memHit = memCache.get(key)
  if (memHit) {
    console.log('[stepToGlbCached] memory hit:', key, `(${memCache.size} entries in cache)`)
    return { buffer: memHit, cached: true }
  }

  // 2. IndexedDB cache (persistent across restarts)
  try {
    const dbHit = await getCached(key)
    if (dbHit) {
      console.log('[stepToGlbCached] IndexedDB hit:', key, `size=${dbHit.byteLength}`)
      memCache.set(key, dbHit)
      return { buffer: dbHit, cached: true }
    }
  } catch (err) {
    console.warn('[stepToGlbCached] IndexedDB lookup failed:', err)
  }

  // 3. Worker conversion: ReadStepFile in worker → buildGlb on main thread
  console.log('[stepToGlbCached] miss, starting worker conversion:', key)
  const stepBuffer = stepData instanceof ArrayBuffer ? stepData : stepData.buffer.slice(0)
  const importResult = await convertInWorker(stepBuffer, OCCT_PARAMS)
  const buffer = buildGlbFromResult(importResult, options)
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
  console.log(`[stepToGlbCached] conversion done in ${elapsed}s, size=${buffer.byteLength}`)

  memCache.set(key, buffer)
  // Persist to IndexedDB for cross-restart cache hits
  try {
    await putCached(key, buffer)
    console.log('[stepToGlbCached] persisted to IndexedDB:', key)
  } catch (err) {
    console.warn('[stepToGlbCached] IndexedDB write failed:', err)
  }

  return { buffer, cached: false }
}
