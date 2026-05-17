import type { OcctNode, OcctMesh } from './occtLoader'

const POOL_SIZE = 3
const MAX_PRECACHE_WORKERS = 1

type TaskType = 'user' | 'precache'

interface WorkerSlot {
  worker: Worker
  busy: boolean
  taskType: TaskType | null
  cacheKey: string | null
}

export interface OcctImportResult {
  root: OcctNode
  meshes: OcctMesh[]
}

interface PendingRequest {
  resolve: (v: OcctImportResult) => void
  reject: (e: Error) => void
}

const slots: WorkerSlot[] = []
let requestId = 0
const pending = new Map<number, PendingRequest>()

// Dedup: one file = one in-flight conversion, regardless of who asked
const pendingPromises = new Map<string, Promise<OcctImportResult>>()

function createSlot(): WorkerSlot {
  const worker = new Worker('step-worker.js')

  worker.onmessage = (e: MessageEvent) => {
    const { type, id, success, root, meshes, error } = e.data
    if (type !== 'result') return

    const req = pending.get(id)
    if (!req) return
    pending.delete(id)

    // Mark slot as free
    const slot = slots.find(s => s.worker === worker)
    if (slot) {
      slot.busy = false
      slot.taskType = null
      slot.cacheKey = null
    }

    if (success) {
      req.resolve({ root, meshes })
    } else {
      req.reject(new Error(error || 'Unknown worker error'))
    }
  }

  worker.onerror = (err: ErrorEvent) => {
    console.error('[WorkerPool] worker error:', err.message || err)
    for (const [pid, req] of pending) {
      const slot = slots.find(s => s.worker === worker && s.busy)
      if (slot) {
        req.reject(new Error('Worker error'))
        pending.delete(pid)
      }
    }
    const idx = slots.findIndex(s => s.worker === worker)
    if (idx >= 0) {
      console.warn('[WorkerPool] replacing crashed worker at index', idx)
      slots[idx] = createSlot()
    }
  }

  // Early WASM init
  worker.postMessage({ type: 'init' })

  return { worker, busy: false, taskType: null, cacheKey: null }
}

// Create pool at module load time
for (let i = 0; i < POOL_SIZE; i++) {
  slots.push(createSlot())
}

function countBusyByType(taskType: TaskType): number {
  return slots.filter(s => s.busy && s.taskType === taskType).length
}

function acquire(taskType: TaskType): WorkerSlot | null {
  // Pre-cache: limit concurrent workers
  if (taskType === 'precache' && countBusyByType('precache') >= MAX_PRECACHE_WORKERS) {
    return null
  }
  const slot = slots.find(s => !s.busy)
  if (slot) {
    slot.busy = true
    slot.taskType = taskType
  }
  return slot ?? null
}

export function convertInWorker(
  cacheKey: string,
  stepData: ArrayBuffer,
  params: Record<string, unknown>,
  priority: TaskType = 'user',
): Promise<OcctImportResult> {
  // Dedup: if this file is already being converted, wait for that same Promise
  const existing = pendingPromises.get(cacheKey)
  if (existing) {
    console.log('[WorkerPool] dedup hit, waiting for in-flight conversion:', cacheKey)
    return existing
  }

  const promise = new Promise<OcctImportResult>((resolve, reject) => {
    const slot = acquire(priority)
    if (!slot) {
      reject(new Error(priority === 'precache'
        ? 'No free worker for pre-cache'
        : 'All workers busy'))
      return
    }

    const id = ++requestId
    slot.cacheKey = cacheKey
    pending.set(id, { resolve, reject })
    slot.worker.postMessage(
      { type: 'convert', id, stepData, params },
      [stepData],
    )
  })

  // Register the promise so other callers can await it
  pendingPromises.set(cacheKey, promise)
  promise.finally(() => {
    pendingPromises.delete(cacheKey)
  })

  return promise
}

export function hasFreeWorker(): boolean {
  return slots.some(s => !s.busy)
}
