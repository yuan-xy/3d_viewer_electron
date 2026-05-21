import { detectFormat } from '@/config/file-formats'
import { cacheKey, getThumbnail, putThumbnail } from './thumbnailCache'
import { generateThumbnail } from './thumbnailGenerator'
import { getCached as getStepCached } from '@/lib/step-converter/stepCache'

export interface QueueFile {
  name: string
  path: string
  mtimeMs: number
}

export type ThumbnailCallback = (filePath: string, objectURL: string) => void
export type ThumbnailProgressCallback = (filePath: string) => void

const GAP_MS = 200

let currentFiles: QueueFile[] = []
let visiblePaths = new Set<string>()
let queue: QueueFile[] = []
let processing = false
let abortFlag = false
let onReady: ThumbnailCallback | null = null
let onProcessing: ThumbnailProgressCallback | null = null
let idleCallbackId = 0
let timeoutId: ReturnType<typeof setTimeout> | null = null

function scheduleNext(): void {
  if (typeof requestIdleCallback !== 'undefined') {
    idleCallbackId = requestIdleCallback(processNext, { timeout: 1000 })
  } else {
    timeoutId = setTimeout(processNext, GAP_MS)
  }
}

function cancelSchedule(): void {
  if (idleCallbackId) {
    cancelIdleCallback(idleCallbackId)
    idleCallbackId = 0
  }
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
}

async function processNext(): Promise<void> {
  if (abortFlag || queue.length === 0) {
    processing = false
    return
  }

  if (document.hidden) {
    timeoutId = setTimeout(processNext, 1000)
    return
  }

  const file = queue.shift()!
  const key = cacheKey(file.path, file.mtimeMs)

  onProcessing?.(file.path)

  try {
    const cached = await getThumbnail(key)
    if (cached && onReady) {
      const url = URL.createObjectURL(cached)
      onReady(file.path, url)
    } else {
      const format = detectFormat(file.name)
      if (!format) {
        onReady?.(file.path, '') // trigger re-render to clear spinner
      } else if (format === 'step') {
        // For STEP files, wait for pre-cache to finish
        const stepCached = await getStepCached(key)
        if (stepCached) {
          const blob = await generateThumbnail(stepCached, 'glb')
          if (blob && onReady) {
            await putThumbnail(key, blob)
            const url = URL.createObjectURL(blob)
            onReady(file.path, url)
          } else {
            onReady?.(file.path, '')
          }
        } else {
          onReady?.(file.path, '')
        }
      } else {
        const result = await window.electronAPI.readFile(file.path)
        if (result.success && result.data) {
          const blob = await generateThumbnail(result.data, format)
          if (blob && onReady) {
            await putThumbnail(key, blob)
            const url = URL.createObjectURL(blob)
            onReady(file.path, url)
          } else {
            onReady?.(file.path, '')
          }
        } else {
          onReady?.(file.path, '')
        }
      }
    }
  } catch (err) {
    console.warn('[thumbnailQueue] failed for', file.name, err)
    onReady?.(file.path, '')
  }

  if (!abortFlag && queue.length > 0) {
    timeoutId = setTimeout(processNext, GAP_MS)
  } else {
    processing = false
  }
}

export function startThumbnailQueue(
  files: QueueFile[],
  callback: ThumbnailCallback,
  progressCallback?: ThumbnailProgressCallback,
): void {
  abortFlag = true
  cancelSchedule()
  currentFiles = [...files]
  onReady = callback
  onProcessing = progressCallback ?? null

  // Wait a tick for any in-flight process to stop
  setTimeout(() => {
    abortFlag = false
    rebuildQueue()
  }, 50)
}

export function stopThumbnailQueue(): void {
  abortFlag = true
  cancelSchedule()
  currentFiles = []
  visiblePaths.clear()
  queue = []
  processing = false
  onReady = null
  onProcessing = null
}

export function updateVisibleFiles(visiblePaths_: Set<string>): void {
  visiblePaths = visiblePaths_
  if (processing) {
    // Reorder existing queue: visible files first
    const visible: QueueFile[] = []
    const hidden: QueueFile[] = []
    for (const f of queue) {
      if (visiblePaths.has(f.path)) visible.push(f)
      else hidden.push(f)
    }
    queue = [...visible, ...hidden]
  } else {
    rebuildQueue()
  }
}

function rebuildQueue(): void {
  if (currentFiles.length === 0) return

  const visible: QueueFile[] = []
  const hidden: QueueFile[] = []

  for (const f of currentFiles) {
    if (visiblePaths.has(f.path)) visible.push(f)
    else hidden.push(f)
  }

  queue = [...visible, ...hidden]

  if (!processing && queue.length > 0) {
    processing = true
    scheduleNext()
  }
}
