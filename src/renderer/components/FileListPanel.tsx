import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useModelStore } from '@/stores/model-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { stepToGlb } from '@/lib/step-converter'

const EXT_COLORS: Record<string, string> = {
  '.stl': 'text-blue-500',
  '.glb': 'text-green-500',
  '.3mf': 'text-orange-500',
  '.step': 'text-purple-500',
  '.stp': 'text-purple-500',
}

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i) : ''
}

export default function FileListPanel() {
  const { t } = useTranslation()
  const { currentFolderPath, folderFiles, selectedFileIndex, setSelectedFileIndex, setFolderFiles, glbUrl } = useModelStore()
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    if (selectedFileIndex < 0 || !listRef.current) return
    const item = listRef.current.querySelector(`[data-index="${selectedFileIndex}"]`) as HTMLElement
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedFileIndex])

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
      <div className="p-2 text-xs font-semibold text-muted-foreground border-b">
        {t('fileList.title')}
      </div>
      {currentFolderPath && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b truncate" title={currentFolderPath}>
          {t('fileList.folder')}: {currentFolderPath}
        </div>
      )}
      <ScrollArea className="flex-1">
        <div ref={listRef} className="p-2">
          {folderFiles.map((file, i) => {
            const isSelected = i === selectedFileIndex
            const isCurrent = file.name === glbUrl
            return (
              <div
                key={file.path}
                data-index={i}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer mb-0.5',
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
                <span className={cn('font-medium shrink-0', EXT_COLORS[getExt(file.name)])}>
                  {getExt(file.name).toUpperCase().slice(1)}
                </span>
                <span className="truncate text-foreground" title={file.name}>
                  {file.name}
                </span>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

async function handleFileClick(file: { name: string; path: string }, index: number) {
  const { setSelectedFileIndex } = useModelStore.getState()
  setSelectedFileIndex(index)

  try {
    const result = await window.electronAPI.readFileAsBase64(file.path)
    if (!result.success || !result.data) {
      toast.error('Load failed: ' + (result.error || 'unknown error'))
      return
    }
    const binaryString = atob(result.data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const buffer = bytes.buffer
    const ext = file.name.split('.').pop()?.toLowerCase()
    const isStep = ext === 'step' || ext === 'stp'
    if (isStep) {
      const glbBuffer = await stepToGlb(buffer, {
        wasmPath: '/wasm/occt-import-js.wasm',
      })
      useModelStore.getState().setModelBuffer(glbBuffer, 'glb')
    } else {
      useModelStore.getState().setModelBuffer(buffer, ext as 'stl' | 'glb' | '3mf')
    }
    useModelStore.getState().setGLBUrl(file.name)
  } catch (e) {
    toast.error('Load failed: ' + String(e))
  }
}