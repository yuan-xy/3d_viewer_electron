const DB_NAME = 'thumbnail-cache'
const DB_VERSION = 1
const STORE_NAME = 'thumbnails'
const MEM_CACHE_MAX = 200

export const memCache = new Map<string, Blob>()

let dbPromise: Promise<IDBDatabase> | null = null

function openCache(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

export function cacheKey(filePath: string, mtimeMs: number): string {
  return `${filePath.replace(/\\/g, '/')}|${Math.trunc(mtimeMs)}`
}

export async function getThumbnail(key: string): Promise<Blob | null> {
  const memHit = memCache.get(key)
  if (memHit) return memHit

  try {
    const db = await openCache()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(key)
      request.onsuccess = () => {
        const result = request.result
        if (result instanceof Blob) {
          if (memCache.size >= MEM_CACHE_MAX) {
            const first = memCache.keys().next().value
            if (first !== undefined) memCache.delete(first)
          }
          memCache.set(key, result)
          resolve(result)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function putThumbnail(key: string, blob: Blob): Promise<void> {
  if (memCache.size >= MEM_CACHE_MAX) {
    const first = memCache.keys().next().value
    if (first !== undefined) memCache.delete(first)
  }
  memCache.set(key, blob)

  try {
    const db = await openCache()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(blob, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch {
    // best-effort: memCache already populated
  }
}

export async function clearThumbnailCache(): Promise<void> {
  try {
    const db = await openCache()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[clearThumbnailCache] IndexedDB clear failed:', err)
  }
  memCache.clear()
  console.log('[clearThumbnailCache] Done')
}

export async function getAllThumbnailKeys(): Promise<string[]> {
  const keys: string[] = []
  try {
    const db = await openCache()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).getAllKeys()
      request.onsuccess = () => resolve(request.result as string[])
      request.onerror = () => resolve([])
    })
  } catch {
    return keys
  }
}
