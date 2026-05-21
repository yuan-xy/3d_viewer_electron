import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { Trash2, HardDrive, RefreshCw, Database, Check, Image } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { clearStepCache, memCache } from '@/lib/step-converter/stepCache'
import {
  clearThumbnailCache,
  memCache as thumbMemCache,
} from '@/lib/thumbnail-cache/thumbnailCache'
import { useThemeColors } from '@/components/settings/useThemeColors'

type CacheKind = 'step' | 'thumbnail'

interface CacheEntry {
  key: string
  size: number
  type: 'memory' | 'indexeddb'
  kind: CacheKind
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function parseKey(key: string): { path: string; mtime: string } {
  const parts = key.split('|')
  return {
    path: parts[0] || key,
    mtime: parts[1] ? new Date(Number(parts[1])).toLocaleString() : 'unknown',
  }
}

const STEP_DB_NAME = 'step-glb-cache'
const STEP_DB_VERSION = 1
const STEP_STORE_NAME = 'buffers'

function openStepIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STEP_DB_NAME, STEP_DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STEP_STORE_NAME)) {
        request.result.createObjectStore(STEP_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const THUMB_DB_NAME = 'thumbnail-cache'
const THUMB_DB_VERSION = 1
const THUMB_STORE_NAME = 'thumbnails'

function openThumbIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(THUMB_DB_NAME, THUMB_DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(THUMB_STORE_NAME)) {
        request.result.createObjectStore(THUMB_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

interface CacheManagerProps {
  children?: React.ReactNode
}

export function CacheManager({ children }: CacheManagerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<CacheEntry[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const colors = useThemeColors()

  const loadEntries = async () => {
    setLoading(true)
    const items: CacheEntry[] = []

    // STEP memory cache
    memCache.forEach((buffer, key) => {
      items.push({ key, size: buffer.byteLength, type: 'memory', kind: 'step' })
    })

    // Thumbnail memory cache
    thumbMemCache.forEach((blob, key) => {
      items.push({ key, size: blob.size, type: 'memory', kind: 'thumbnail' })
    })

    // STEP IndexedDB
    try {
      const db = await openStepIDB()
      const tx = db.transaction(STEP_STORE_NAME, 'readonly')
      const store = tx.objectStore(STEP_STORE_NAME)
      const request = store.openCursor()

      await new Promise<void>((resolve) => {
        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) {
            if (!items.find(e => e.key === cursor.key && e.kind === 'step')) {
              const size = cursor.value instanceof ArrayBuffer
                ? cursor.value.byteLength
                : cursor.value?.byteLength || 0
              items.push({ key: cursor.key as string, size, type: 'indexeddb', kind: 'step' })
            }
            cursor.continue()
          } else {
            resolve()
          }
        }
        request.onerror = () => resolve()
      })
    } catch (e) {
      console.warn('[CacheManager] STEP IndexedDB read failed:', e)
    }

    // Thumbnail IndexedDB
    try {
      const db = await openThumbIDB()
      const tx = db.transaction(THUMB_STORE_NAME, 'readonly')
      const store = tx.objectStore(THUMB_STORE_NAME)
      const request = store.openCursor()

      await new Promise<void>((resolve) => {
        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) {
            if (!items.find(e => e.key === cursor.key && e.kind === 'thumbnail')) {
              const size = cursor.value instanceof Blob
                ? cursor.value.size
                : 0
              items.push({ key: cursor.key as string, size, type: 'indexeddb', kind: 'thumbnail' })
            }
            cursor.continue()
          } else {
            resolve()
          }
        }
        request.onerror = () => resolve()
      })
    } catch (e) {
      console.warn('[CacheManager] Thumbnail IndexedDB read failed:', e)
    }

    setEntries(items)
    setSelectedKeys(new Set())
    setLoading(false)
  }

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadEntries()
    }
  }, [open])

  const handleSelect = (key: string) => {
    const next = new Set(selectedKeys)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    setSelectedKeys(next)
  }

  const handleSelectAll = () => {
    if (selectedKeys.size === entries.length) {
      setSelectedKeys(new Set())
    } else {
      setSelectedKeys(new Set(entries.map(e => `${e.kind}:${e.key}`)))
    }
  }

  function entryId(entry: CacheEntry): string {
    return `${entry.kind}:${entry.key}`
  }

  const handleClearSelected = async () => {
    if (selectedKeys.size === 0) return
    setLoading(true)

    const stepKeys: string[] = []
    const thumbKeys: string[] = []

    for (const id of selectedKeys) {
      const [kind, ...keyParts] = id.split(':')
      const key = keyParts.join(':')
      if (kind === 'step') stepKeys.push(key)
      else thumbKeys.push(key)
    }

    // Clear STEP entries
    if (stepKeys.length > 0) {
      try {
        const db = await openStepIDB()
        const tx = db.transaction(STEP_STORE_NAME, 'readwrite')
        const store = tx.objectStore(STEP_STORE_NAME)
        for (const key of stepKeys) {
          store.delete(key)
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error)
        })
        for (const key of stepKeys) {
          memCache.delete(key)
        }
      } catch (e) {
        console.warn('[CacheManager] STEP delete failed:', e)
      }
    }

    // Clear thumbnail entries
    if (thumbKeys.length > 0) {
      try {
        const db = await openThumbIDB()
        const tx = db.transaction(THUMB_STORE_NAME, 'readwrite')
        const store = tx.objectStore(THUMB_STORE_NAME)
        for (const key of thumbKeys) {
          store.delete(key)
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error)
        })
        for (const key of thumbKeys) {
          thumbMemCache.delete(key)
        }
      } catch (e) {
        console.warn('[CacheManager] Thumbnail delete failed:', e)
      }
    }

    await loadEntries()
  }

  const handleClearAll = async () => {
    setLoading(true)
    await clearStepCache()
    await clearThumbnailCache()
    await loadEntries()
  }

  // Group entries
  const stepMemory = entries.filter(e => e.kind === 'step' && e.type === 'memory')
  const stepDisk = entries.filter(e => e.kind === 'step' && e.type === 'indexeddb')
  const thumbMemory = entries.filter(e => e.kind === 'thumbnail' && e.type === 'memory')
  const thumbDisk = entries.filter(e => e.kind === 'thumbnail' && e.type === 'indexeddb')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <button
            title={t('cache.title')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: colors.textInactive,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            <Database size={14} />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('cache.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 4,
                border: `1px solid ${colors.border}`,
                background: 'transparent',
                color: colors.textInactive,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              <Check size={12} />
              {t('cache.selectAll')}
            </button>
            <button
              onClick={loadEntries}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 4,
                border: `1px solid ${colors.border}`,
                background: 'transparent',
                color: colors.textInactive,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              <RefreshCw size={12} />
              {t('cache.refresh')}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClearSelected}
              disabled={selectedKeys.size === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 4,
                border: `1px solid ${selectedKeys.size > 0 ? colors.destructive : colors.border}`,
                background: selectedKeys.size > 0 ? `${colors.destructive}20` : 'transparent',
                color: selectedKeys.size > 0 ? colors.destructive : colors.textDisabled,
                cursor: selectedKeys.size > 0 ? 'pointer' : 'not-allowed',
                fontSize: 11,
              }}
            >
              <Trash2 size={12} />
              {t('cache.clearSelected')} ({selectedKeys.size})
            </button>
            <button
              onClick={handleClearAll}
              disabled={entries.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 4,
                border: `1px solid ${entries.length > 0 ? colors.destructive : colors.border}`,
                background: entries.length > 0 ? `${colors.destructive}20` : 'transparent',
                color: entries.length > 0 ? colors.destructive : colors.textDisabled,
                cursor: entries.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: 11,
              }}
            >
              <Trash2 size={12} />
              {t('cache.clearAll')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t('app.loading') || 'Loading...'}
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t('cache.empty')}
            </div>
          ) : (
            <div className="space-y-1">
              {stepMemory.length > 0 && (
                <CacheSection
                  icon={HardDrive}
                  label={`${t('cache.memory')} (STEP)`}
                  entries={stepMemory}
                  selectedKeys={selectedKeys}
                  onSelect={handleSelect}
                  entryId={entryId}
                />
              )}
              {stepDisk.length > 0 && (
                <CacheSection
                  icon={Database}
                  label={`${t('cache.disk')} (STEP)`}
                  entries={stepDisk}
                  selectedKeys={selectedKeys}
                  onSelect={handleSelect}
                  entryId={entryId}
                />
              )}
              {thumbMemory.length > 0 && (
                <CacheSection
                  icon={Image}
                  label={`${t('cache.memory')} (Thumbnail)`}
                  entries={thumbMemory}
                  selectedKeys={selectedKeys}
                  onSelect={handleSelect}
                  entryId={entryId}
                />
              )}
              {thumbDisk.length > 0 && (
                <CacheSection
                  icon={Image}
                  label={`${t('cache.disk')} (Thumbnail)`}
                  entries={thumbDisk}
                  selectedKeys={selectedKeys}
                  onSelect={handleSelect}
                  entryId={entryId}
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CacheSection({
  icon: Icon,
  label,
  entries,
  selectedKeys,
  onSelect,
  entryId,
}: {
  icon: React.ComponentType<{ size?: number }>
  label: string
  entries: CacheEntry[]
  selectedKeys: Set<string>
  onSelect: (id: string) => void
  entryId: (entry: CacheEntry) => string
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1 mb-1 text-xs text-muted-foreground font-medium">
        <Icon size={11} />
        {label} ({entries.length})
      </div>
      {entries.map(entry => {
        const { path, mtime } = parseKey(entry.key)
        const id = entryId(entry)
        return (
          <div
            key={id}
            onClick={() => onSelect(id)}
            className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-accent text-xs"
          >
            <input
              type="checkbox"
              checked={selectedKeys.has(id)}
              onChange={() => {}}
              className="accent-primary"
            />
            <div className="flex-1 min-w-0">
              <div className="truncate text-foreground" title={path}>{path}</div>
              <div className="text-muted-foreground text-[10px]">{mtime}</div>
            </div>
            <div className="text-muted-foreground shrink-0">{formatBytes(entry.size)}</div>
          </div>
        )
      })}
    </div>
  )
}
