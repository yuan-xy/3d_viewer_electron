import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useModelStore, type FileSortMode } from '@/stores/model-store'
import { useUIStore } from '@/stores/ui-store'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { stepToGlbCached, startPreCache } from '@/lib/step-converter'
import { EXT_COLORS, detectFormat } from '@/config/file-formats'
import { Button } from '@/components/ui/button'
import { List, ArrowUpAZ, ArrowDownZA, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import {
  startThumbnailQueue,
  stopThumbnailQueue,
  updateVisibleFiles,
  type QueueFile,
} from '@/lib/thumbnail-cache/thumbnailQueue'

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

interface ThumbState {
  urls: Map<string, string>
  failed: Set<string>
}

export default function FileListPanel() {
  const { t } = useTranslation()
  const {
    currentFolderPath,
    folderFiles,
    selectedFileIndex,
    fileSortMode,
    sortOrder,
    setSelectedFileIndex,
    setFileSortMode,
    setSortOrder,
    glbUrl,
  } = useModelStore()
  const enablePreview = useUIStore((s) => s.enablePreview)
  const setEnablePreview = useUIStore((s) => s.setEnablePreview)
  const listRef = useRef<HTMLDivElement>(null)

  const [thumbState, setThumbState] = useState<ThumbState>({ urls: new Map(), failed: new Set() })
  const observerRef = useRef<IntersectionObserver | null>(null)
  const visiblePathsRef = useRef<Set<string>>(new Set())

  // Scroll selected item into view
  useEffect(() => {
    if (selectedFileIndex < 0 || !listRef.current) return
    const item = listRef.current.querySelector(`[data-index="${selectedFileIndex}"]`) as HTMLElement
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedFileIndex])

  // Auto pre-cache uncached STEP files in background after file list populates
  useEffect(() => {
    if (folderFiles.length === 0) return
    const timer = setTimeout(() => {
      startPreCache(folderFiles, '/wasm/occt-import-js.wasm')
    }, 1000)
    return () => clearTimeout(timer)
  }, [folderFiles])

  const [processingPath, setProcessingPath] = useState<string | null>(null)

  // Thumbnail queue lifecycle
  const handleThumbReady = useCallback((filePath: string, objectURL: string) => {
    setProcessingPath(null)
    // Empty URL means thumbnail generation failed — mark as failed
    if (!objectURL) {
      setThumbState((prev) => {
        const failed = new Set(prev.failed)
        failed.add(filePath)
        return { ...prev, failed }
      })
      return
    }
    setThumbState((prev) => {
      const urls = new Map(prev.urls)
      const old = urls.get(filePath)
      if (old) URL.revokeObjectURL(old)
      urls.set(filePath, objectURL)
      const failed = new Set(prev.failed)
      failed.delete(filePath)
      return { urls, failed }
    })
  }, [])

  const handleThumbProgress = useCallback((filePath: string) => {
    setProcessingPath(filePath)
  }, [setProcessingPath])

  useEffect(() => {
    if (!enablePreview || folderFiles.length === 0) {
      stopThumbnailQueue()
      return
    }

    const files: QueueFile[] = folderFiles.map((f) => ({
      name: f.name,
      path: f.path,
      mtimeMs: f.mtimeMs,
    }))

    // Reset thumbnail state when folder changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThumbState((prev) => {
      prev.urls.forEach((url) => URL.revokeObjectURL(url))
      return { urls: new Map(), failed: new Set() }
    })

    startThumbnailQueue(files, handleThumbReady, handleThumbProgress)

    return () => {
      stopThumbnailQueue()
    }
  }, [enablePreview, folderFiles, handleThumbReady])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      setThumbState((prev) => {
        prev.urls.forEach((url) => URL.revokeObjectURL(url))
        return prev
      })
    }
  }, [])

  // IntersectionObserver for thumbnail priority
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enablePreview) return

    observerRef.current?.disconnect()
    const visiblePaths = visiblePathsRef.current
    visiblePaths.clear()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const path = entry.target.getAttribute('data-path')
          if (!path) continue
          if (entry.isIntersecting) {
            visiblePaths.add(path)
          } else {
            visiblePaths.delete(path)
          }
        }
        updateVisibleFiles(visiblePaths)
      },
      { root: gridRef.current, rootMargin: '100px' },
    )

    observerRef.current = observer
    const cards = gridRef.current?.querySelectorAll('[data-path]')
    cards?.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [enablePreview, folderFiles])

  // Re-observe cards after DOM updates
  useEffect(() => {
    if (!enablePreview || !observerRef.current) return
    const cards = gridRef.current?.querySelectorAll('[data-path]')
    cards?.forEach((el) => observerRef.current!.observe(el))
  }, [thumbState, enablePreview])

  const sortedFiles = useMemo(() => {
    const files = [...folderFiles]
    const cmp = (a: { name: string }, b: { name: string }) => {
      if (fileSortMode === 'type+name') {
        const extA = getExt(a.name)
        const extB = getExt(b.name)
        if (extA !== extB) return extA.localeCompare(extB)
      }
      return a.name.localeCompare(b.name)
    }
    files.sort(cmp)
    if (sortOrder === 'desc') files.reverse()
    return files
  }, [folderFiles, fileSortMode, sortOrder])

  function cycleSortMode() {
    const next: FileSortMode = fileSortMode === 'name' ? 'type+name' : 'name'
    setFileSortMode(next)
  }

  function toggleSortOrder() {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
  }

  if (folderFiles.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 text-xs font-semibold text-muted-foreground border-b">
          {t('fileList.title')}
        </div>
        <ScrollArea className="flex-1 p-4">
          <p className="text-xs text-muted-foreground text-center py-8">{t('fileList.empty')}</p>
        </ScrollArea>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 text-xs font-semibold text-muted-foreground border-b flex items-center justify-between">
        <span>{t('fileList.title')}</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setEnablePreview(!enablePreview)}
            title={enablePreview ? t('fileList.previewView') : t('fileList.listView')}
          >
            {enablePreview ? <Eye className={cn('h-3 w-3', enablePreview && 'text-primary')} /> : <EyeOff className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={cycleSortMode}
            title={fileSortMode === 'name' ? t('fileList.sortByName') : t('fileList.sortByType')}
          >
            <List className={cn('h-3 w-3', fileSortMode === 'type+name' && 'text-primary')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={toggleSortOrder}
            title={sortOrder === 'asc' ? t('fileList.sortAsc') : t('fileList.sortDesc')}
          >
            {sortOrder === 'asc' ? (
              <ArrowUpAZ className="h-3 w-3" />
            ) : (
              <ArrowDownZA className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
      {currentFolderPath && (
        <ScrollArea className="border-b">
          <div className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap min-w-max">
            {currentFolderPath}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {enablePreview ? (
        <ScrollArea className="flex-1">
          <div
            ref={gridRef}
            className="p-2 grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
          >
            {sortedFiles.map((file, i) => {
              const isSelected = i === selectedFileIndex
              const isCurrent = file.name === glbUrl
              const thumbUrl = thumbState.urls.get(file.path)
              const failed = thumbState.failed.has(file.path)

              return (
                <div
                  key={file.path}
                  data-index={i}
                  data-path={file.path}
                  className={cn(
                    'rounded-lg overflow-hidden cursor-pointer transition-all duration-100',
                    isSelected && 'ring-2 ring-primary',
                    isCurrent && !isSelected && 'ring-2 ring-primary/60',
                    !isSelected && !isCurrent && 'hover:ring-1 hover:ring-primary/40',
                  )}
                  onClick={() => handleFileClick(file, i)}
                  onMouseEnter={() => {
                    if (selectedFileIndex === -1 && !isCurrent) setSelectedFileIndex(i)
                  }}
                >
                  <div
                    className="relative w-full bg-muted flex items-center justify-center overflow-hidden"
                    style={{ aspectRatio: '4/3' }}
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={file.name}
                        className="w-full h-full object-cover opacity-0 transition-opacity duration-300"
                        onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = '1' }}
                      />
                    ) : (
                      <PlaceholderCard file={file} failed={failed} loading={processingPath === file.path} />
                    )}

                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5">
                      <span className="text-[10px] text-white/90 truncate block" title={file.name}>
                        {file.name}
                      </span>
                    </div>

                    {isCurrent && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary shadow-sm" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1">
          <div ref={listRef} className="p-2 min-w-max">
            {sortedFiles.map((file, i) => {
              const isSelected = i === selectedFileIndex
              const isCurrent = file.name === glbUrl
              const ext = getExt(file.name)
              return (
                <div
                  key={file.path}
                  data-index={i}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer mb-0.5 whitespace-nowrap',
                    'transition-colors duration-100',
                    isSelected ? 'bg-accent ring-1 ring-primary' : 'hover:bg-accent/50',
                    isCurrent && !isSelected && 'bg-primary/10 border border-primary/30',
                  )}
                  onClick={() => handleFileClick(file, i)}
                  onMouseEnter={() => {
                    if (selectedFileIndex === -1 && !isCurrent) setSelectedFileIndex(i)
                  }}
                >
                  {isCurrent && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                  <span className={cn('font-medium shrink-0 text-xs', EXT_COLORS[ext] || 'text-muted-foreground')}>
                    {ext ? ext.toUpperCase().slice(1) : '?'}
                  </span>
                  <span className="text-foreground">
                    {file.name}
                  </span>
                </div>
              )
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  )
}

function PlaceholderCard({ file, failed, loading }: { file: { name: string }; failed: boolean; loading?: boolean }) {
  const ext = getExt(file.name)
  const extLabel = ext ? ext.toUpperCase().slice(1) : '?'

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2">
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '16px 16px',
        }}
      />
      <span
        className={cn(
          'relative z-10 text-base font-bold px-2.5 py-1 rounded-md',
          'bg-background/60 backdrop-blur-sm',
          EXT_COLORS[ext] || 'text-muted-foreground',
        )}
      >
        {extLabel}
      </span>
      {loading && (
        <Loader2 className="relative z-10 h-4 w-4 animate-spin text-muted-foreground/60" />
      )}
      {!loading && failed && (
        <AlertCircle className="relative z-10 h-4 w-4 text-muted-foreground/50" />
      )}
    </div>
  )
}

async function handleFileClick(file: { name: string; path: string; mtimeMs: number }, index: number) {
  const { setSelectedFileIndex } = useModelStore.getState()
  setSelectedFileIndex(index)

  try {
    const result = await window.electronAPI.readFile(file.path)
    if (!result.success || !result.data) {
      console.error('[handleFileClick] readFile failed:', result.error || 'unknown error')
      toast.error('Load failed: ' + (result.error || 'unknown error'))
      return
    }
    const buffer = result.data
    const format = detectFormat(file.name)

    if (format === 'step') {
      useModelStore.getState().setIsConverting(true)
      const { buffer: glbBuffer } = await stepToGlbCached(buffer,
        { filePath: file.path, mtimeMs: file.mtimeMs },
        { wasmPath: '/wasm/occt-import-js.wasm' },
      )
      useModelStore.getState().setIsConverting(false)
      useModelStore.getState().setModelBuffer(glbBuffer, 'glb')
    } else if (format) {
      useModelStore.getState().setModelBuffer(buffer, format)
    } else {
      console.error('[handleFileClick] unsupported format:', file.name)
      toast.error('Unsupported file format: ' + file.name)
      return
    }
    useModelStore.getState().setGLBUrl(file.name)
  } catch (e) {
    console.error('[handleFileClick] exception:', e)
    useModelStore.getState().setIsConverting(false)
    toast.error('Load failed: ' + String(e))
  }
}
