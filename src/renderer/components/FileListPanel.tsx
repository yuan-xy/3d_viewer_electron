import { useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useModelStore, type FileSortMode } from '@/stores/model-store'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { stepToGlbCached, startPreCache } from '@/lib/step-converter'
import { EXT_COLORS, detectFormat } from '@/config/file-formats'
import { Button } from '@/components/ui/button'
import { ArrowDownUp, ArrowUpAZ, ArrowDownZA } from 'lucide-react'

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
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
  const listRef = useRef<HTMLDivElement>(null)

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
            onClick={cycleSortMode}
            title={fileSortMode === 'name' ? t('fileList.sortByName') : t('fileList.sortByType')}
          >
            <ArrowDownUp className={cn('h-3 w-3', fileSortMode === 'type+name' && 'text-primary')} />
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
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b overflow-x-auto whitespace-nowrap">
          {t('fileList.folder')}: {currentFolderPath}
        </div>
      )}
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
    </div>
  )
}

async function handleFileClick(file: { name: string; path: string; mtimeMs: number }, index: number) {
  const { setSelectedFileIndex } = useModelStore.getState()
  setSelectedFileIndex(index)

  try {
    const result = await window.electronAPI.readFileAsBase64(file.path)
    if (!result.success || !result.data) {
      console.error('[handleFileClick] readFileAsBase64 failed:', result.error || 'unknown error')
      toast.error('Load failed: ' + (result.error || 'unknown error'))
      return
    }
    const binaryString = atob(result.data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const buffer = bytes.buffer
    const format = detectFormat(file.name)

    // STEP/STP needs special conversion
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
