import { buildGlbFromResult, type StepToGlbOptions } from './stepToGlb'
import { convertInWorker } from './stepWorkerPool'
import { getCached, putCached } from './stepCache'

const memCache = new Map<string, ArrayBuffer>()

const OCCT_PARAMS = {
  linearUnit: 'millimeter',
  linearDeflectionType: 'absolute_value',
  linearDeflection: 0.001,
  angularDeflection: 0.5,
}

function cacheKey(filePath: string, mtimeMs: number): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedTime = Math.trunc(mtimeMs)
  return `${normalizedPath}|${normalizedTime}`
}

export function addToPreCache(key: string, buffer: ArrayBuffer): void {
  memCache.set(key, buffer)
}

export function isPreCached(key: string): boolean {
  return memCache.has(key)
}

let preCacheRunning = false
let preCacheAbort = false

export function stopPreCache(): void {
  preCacheAbort = true
}

export async function startPreCache(
  files: { name: string; path: string; mtimeMs: number }[],
  wasmPath: string,
): Promise<void> {
  if (preCacheRunning) return
  preCacheRunning = true
  preCacheAbort = false

  const stepFiles = files.filter(f => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    return ext === 'step' || ext === 'stp'
  })

  console.log('[preCache] scanning', stepFiles.length, 'STEP file(s) for pre-caching')

  for (const file of stepFiles) {
    if (preCacheAbort) break

    const key = cacheKey(file.path, file.mtimeMs)
    if (memCache.has(key)) continue

    try {
      const dbHit = await getCached(key)
      if (dbHit) {
        memCache.set(key, dbHit)
        console.log('[preCache] IndexedDB hit, skipping:', file.name)
        continue
      }
    } catch {
      // IndexedDB unavailable, proceed with conversion
    }

    try {
      const result = await window.electronAPI.readFile(file.path)
      if (!result.success || !result.data) {
        console.warn('[preCache] failed to read file:', file.name, result.error)
        continue
      }

      if (preCacheAbort) break

      console.log('[preCache] converting:', file.name)
      const importResult = await convertInWorker(key, result.data, OCCT_PARAMS, 'precache')

      const glbBuffer = buildGlbFromResult(importResult, {
        wasmPath,
        includeSelectorTopology: true,
      } as StepToGlbOptions)

      memCache.set(key, glbBuffer)
      try { await putCached(key, glbBuffer) } catch { /* best-effort */ }
      console.log('[preCache] cached:', file.name, `(${(glbBuffer.byteLength / 1024).toFixed(0)}KB)`)
    } catch (err) {
      if (preCacheAbort) break
      console.warn('[preCache] failed for', file.name + ':', err)
    }
  }

  preCacheRunning = false
  console.log('[preCache] done')
}
