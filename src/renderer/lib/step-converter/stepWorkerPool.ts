import type { OcctNode, OcctMesh } from './occtLoader'

const POOL_SIZE = 2

interface PoolWorker {
  worker: Worker
  busy: boolean
  initStarted: boolean
}

interface OcctImportResult {
  root: OcctNode
  meshes: OcctMesh[]
}

interface PendingRequest {
  resolve: (v: OcctImportResult) => void
  reject: (e: Error) => void
}

const pool: PoolWorker[] = []
let requestId = 0
const pending = new Map<number, PendingRequest>()

function createWorker(): PoolWorker {
  const worker = new Worker('step-worker.js')

  worker.onmessage = (e: MessageEvent) => {
    const { type, id, success, root, meshes, error } = e.data
    if (type !== 'result') return

    const req = pending.get(id)
    if (!req) return
    pending.delete(id)

    // Mark worker as free
    const pw = pool.find(p => p.worker === worker)
    if (pw) pw.busy = false

    if (success) {
      req.resolve({ root, meshes })
    } else {
      req.reject(new Error(error || 'Unknown worker error'))
    }
  }

  worker.onerror = (err: ErrorEvent) => {
    console.error('[WorkerPool] worker error:', err.message || err)
    // Reject only this worker's pending requests
    for (const [pid, req] of pending) {
      const pw = pool.find(p => p.worker === worker && p.busy)
      if (pw) {
        req.reject(new Error('Worker error'))
        pending.delete(pid)
      }
    }
    // Replace crashed worker
    const idx = pool.findIndex(p => p.worker === worker)
    if (idx >= 0) {
      console.warn('[WorkerPool] replacing crashed worker at index', idx)
      pool[idx] = createWorker()
    }
  }

  // Trigger early WASM init so first conversion is faster
  worker.postMessage({ type: 'init' })

  return { worker, busy: false, initStarted: true }
}

// Create pool at module load time
for (let i = 0; i < POOL_SIZE; i++) {
  pool.push(createWorker())
}

function acquire(): PoolWorker | null {
  const pw = pool.find(p => !p.busy)
  if (pw) pw.busy = true
  return pw ?? null
}

export function convertInWorker(
  stepData: ArrayBuffer,
  params: Record<string, unknown>,
): Promise<OcctImportResult> {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    const pw = acquire()
    if (!pw) {
      reject(new Error('All workers busy'))
      return
    }
    pending.set(id, { resolve, reject })
    pw.worker.postMessage(
      { type: 'convert', id, stepData, params },
      [stepData],
    )
  })
}

export function hasFreeWorker(): boolean {
  return pool.some(p => !p.busy)
}
