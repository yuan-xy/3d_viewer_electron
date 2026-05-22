import React, { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useUIStore } from '@/stores/ui-store'
import { useModelStore, type SceneTreeNode } from '@/stores/model-store'
import { useSelectionStore } from '@/stores/selection-store'
import { cn } from '@/lib/utils'
import { stepToGlbCached } from '@/lib/step-converter'
import { detectFormat, FORMAT_MAP, getDefaultUpAxis } from '@/config/file-formats'
import { loadFormat } from '@/engine/formatLoaders'
import { setCachedResult } from '@/engine/loaderResultCache'
import { generateThumbnailFromResult } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, FolderOpen,
  Maximize, Minimize, Info, X,
  ChevronRight, ChevronDown, Eye, EyeOff,
  Cuboid, Grid3x3,
} from 'lucide-react'
import WorkspacePage from '@/pages/WorkspacePage'
import FileListPanel from '@/components/FileListPanel'
import ModelInfoPanel from '@/components/ModelInfoPanel'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { CacheManager } from '@/components/CacheManager'

function SceneTreeItem({ node, depth }: { node: SceneTreeNode; depth: number }) {
  const hasChildren = node.children && node.children.length > 0
  const toggleExpanded = useModelStore((s) => s.toggleNodeExpanded)
  const toggleVisible = useModelStore((s) => s.toggleNodeVisible)
  const setActiveFile = useModelStore((s) => s.setActiveFile)
  const removeLoadedFile = useModelStore((s) => s.removeLoadedFile)
  const selectedReferenceIds = useSelectionStore((s) => s.selectedReferenceIds)
  const isSelected = selectedReferenceIds.includes(node.id)
  const isFileNode = node.id.startsWith('file:')
  const fileId = isFileNode ? node.id.slice(5) : null

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 text-sm py-1 px-1 rounded hover:bg-accent cursor-pointer group whitespace-nowrap',
          isFileNode && 'font-semibold',
          !node.visible && 'opacity-40',
          isSelected && 'bg-accent ring-1 ring-primary',
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={(e) => {
          if (isFileNode && fileId) {
            setActiveFile(fileId)
            return
          }
          const { setSelectedReference } = useSelectionStore.getState()
          setSelectedReference(node.id, { shiftKey: e.shiftKey })
        }}
      >
        {/* Expand/collapse chevron */}
        <button
          className="h-4 w-4 shrink-0 flex items-center justify-center rounded hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            toggleExpanded(node.id)
          }}
          aria-label={node.expanded ? 'collapse' : 'expand'}
        >
          {hasChildren ? (
            node.expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="w-3" />
          )}
        </button>

        {/* Visibility toggle (eye) */}
        <button
          className="h-4 w-4 shrink-0 flex items-center justify-center rounded hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            toggleVisible(node.id)
          }}
          aria-label={node.visible ? 'hide' : 'show'}
        >
          {node.visible ? (
            <Eye className="h-3 w-3" />
          ) : (
            <EyeOff className="h-3 w-3" />
          )}
        </button>

        <span className="flex-1 truncate">{node.name}</span>

        {/* Close button for file-level nodes */}
        {isFileNode && fileId && (
          <button
            className="h-4 w-4 shrink-0 flex items-center justify-center rounded hover:bg-destructive/20 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              removeLoadedFile(fileId)
            }}
            aria-label="remove file"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Recursive children */}
      {hasChildren && node.expanded &&
        node.children!.map((child) => (
          <SceneTreeItem key={child.id} node={child} depth={depth + 1} />
        ))}
    </>
  )
}

const MIN_PANEL_PCT = 8
const MAX_PANEL_PCT = 40

function ResizeHandle({
  onMouseDown,
}: {
  onMouseDown: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className="shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
      style={{ width: 4 }}
      onMouseDown={onMouseDown}
    />
  )
}

export default function DesktopLayout() {
  const { projectId } = useParams<{ projectId?: string }>()
  const { t } = useTranslation()
  const ui = useUIStore()
  const activeUpAxis = useModelStore((s) => s.activeUpAxis)
  const sceneTree = useModelStore((s) => s.sceneTree)
  const hasModel = useModelStore((s) => s.modelBuffer !== null || s.loadedFiles.length > 0)
  const folderFilesLen = useModelStore((s) => s.folderFiles.length)
  const selectedFileIndex = useModelStore((s) => s.selectedFileIndex)
  const setActiveUpAxis = useModelStore((s) => s.setActiveUpAxis)

  const activeTool = hasModel

  const [leftPanelPct, setLeftPanelPct] = useState(15)
  const [rightPanelPct, setRightPanelPct] = useState(15)
  const [resizing, setResizing] = useState<'left' | 'right' | null>(null)

  useEffect(() => {
    if (!resizing) return
    const handleMouseMove = (e: MouseEvent) => {
      const totalWidth = window.innerWidth
      const pct = (e.clientX / totalWidth) * 100
      if (resizing === 'left') {
        setLeftPanelPct(Math.max(MIN_PANEL_PCT, Math.min(MAX_PANEL_PCT, pct)))
      } else {
        setRightPanelPct(Math.max(MIN_PANEL_PCT, Math.min(MAX_PANEL_PCT, 100 - pct)))
      }
    }
    const handleMouseUp = () => setResizing(null)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizing])

  // Reactive compact mode: auto-open/close left panel at 1024px breakpoint
  const isCompactViewport = useMediaQuery('(max-width: 1023px)')

  useEffect(() => {
    useUIStore.setState({ leftPanelOpen: !isCompactViewport })
  }, [isCompactViewport])

  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const unsubscribe = window.electronAPI.onFullscreenChanged(setIsFullscreen)
    return unsubscribe
  }, [])

  const handleToggleFullscreen = useCallback(async () => {
    const result = await window.electronAPI.toggleFullscreen()
    setIsFullscreen(result)
  }, [])

  // Keyboard navigation for file list
  useEffect(() => {
    if (!ui.rightPanelOpen || folderFilesLen === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const { folderFiles, selectedFileIndex, setSelectedFileIndex } = useModelStore.getState()
      if (folderFiles.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = selectedFileIndex === -1 ? 0 : (selectedFileIndex + 1) % folderFiles.length
        setSelectedFileIndex(next)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = selectedFileIndex <= 0 ? folderFiles.length - 1 : selectedFileIndex - 1
        setSelectedFileIndex(prev)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const idx = selectedFileIndex === -1 ? 0 : selectedFileIndex
        const file = folderFiles[idx]
        if (file) {
          const store = useModelStore.getState()
          // If already loaded, just switch
          const existing = store.loadedFiles.find(f => f.filePath === file.path)
          if (existing) {
            store.setActiveFile(existing.id)
            return
          }
          // Otherwise load it
          window.electronAPI.readFile(file.path).then(async (fileResult) => {
            if (fileResult.success && fileResult.data) {
              let buffer = fileResult.data
              const ext = file.name.split('.').pop()?.toLowerCase()
              const isStep = ext === 'step' || ext === 'stp'
              let format = detectFormat(file.name)
              if (isStep) {
                try {
                  useModelStore.getState().setIsConverting(true)
                  const { buffer: glbBuffer } = await stepToGlbCached(buffer,
                    { filePath: file.path, mtimeMs: file.mtimeMs },
                    { wasmPath: '/wasm/occt-import-js.wasm' },
                  )
                  buffer = glbBuffer
                  format = 'glb'
                } catch (e) {
                  console.error('[DesktopLayout] STEP conversion failed:', e)
                  toast.error('STEP conversion failed: ' + (e instanceof Error ? e.message : String(e)))
                  return
                } finally {
                  useModelStore.getState().setIsConverting(false)
                }
              }
              if (!format) return
              const loadResult = await loadFormat(buffer, format, file.path)
              const fileId = crypto.randomUUID()
              setCachedResult(fileId, loadResult)
              const upAxis = getDefaultUpAxis(format, buffer)
              generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
                .then(blob => {
                  if (blob) putThumbnail(`${file.path}|${file.mtimeMs}`, blob)
                })
              useModelStore.getState().addLoadedFile({
                id: fileId,
                fileName: file.name,
                filePath: file.path,
                mtimeMs: file.mtimeMs,
                buffer,
                format,
                sceneTree: [],
                glbPartInfos: [],
                modelCenteringOffset: null,
                sourceUnit: loadResult.sourceUnit ?? FORMAT_MAP[format].defaultUnit,
                fileGroup: FORMAT_MAP[format].group,
                loadingPhase: 'loading',
              })
            }
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [ui.rightPanelOpen, folderFilesLen, selectedFileIndex])

  const handleOpenFile = useCallback(async () => {
    const result = await window.electronAPI.openFileDialog()
    if (!result.success || !result.filePaths?.length) return

    // Clear all currently loaded content before loading new files
    useModelStore.getState().reset()

    const store = useModelStore.getState()
    let firstDirPath: string | null = null

    for (const filePath of result.filePaths) {
      const fileName = filePath.split(/[/\\]/).pop() || filePath
      const dirPath = filePath.slice(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')))
      firstDirPath ??= dirPath

      try {
        const fileResult = await window.electronAPI.readFile(filePath)
        if (!fileResult.success || !fileResult.data) {
          toast.error(`Failed to read: ${fileName}`)
          continue
        }
        let buffer = fileResult.data
        let format = detectFormat(fileName)

        if (format === 'step') {
          store.setIsConverting(true)
          try {
            const { buffer: glbBuffer } = await stepToGlbCached(buffer,
              { filePath, mtimeMs: Date.now() },
              { wasmPath: '/wasm/occt-import-js.wasm' },
            )
            buffer = glbBuffer
            format = 'glb'
          } finally {
            store.setIsConverting(false)
          }
        }

        if (!format) {
          toast.error('Unsupported file format: ' + fileName)
          continue
        }

        // Parse once — result feeds both canvas and thumbnail
        const loadResult = await loadFormat(buffer, format, filePath)
        const fileId = crypto.randomUUID()
        setCachedResult(fileId, loadResult)

        // Thumbnail as byproduct (fire-and-forget)
        const upAxis = getDefaultUpAxis(format, buffer)
        generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
          .then(blob => {
            if (blob) {
              const key = `${filePath}|${Date.now()}`
              putThumbnail(key, blob)
            }
          })

        // Add to store
        const currentStore = useModelStore.getState()
        currentStore.addLoadedFile({
          id: fileId,
          fileName,
          filePath,
          mtimeMs: Date.now(),
          buffer,
          format,
          sceneTree: [],
          glbPartInfos: [],
          modelCenteringOffset: null,
          sourceUnit: loadResult.sourceUnit ?? FORMAT_MAP[format].defaultUnit,
          fileGroup: FORMAT_MAP[format].group,
          loadingPhase: 'loading',
        })
      } catch {
        useModelStore.getState().setIsConverting(false)
        toast.error(`Load failed: ${fileName}`)
      }
    }

    // Populate file list from the first file's directory
    if (firstDirPath) {
      const dirResult = await window.electronAPI.readDirectory(firstDirPath)
      if (dirResult.success && dirResult.files) {
        useModelStore.getState().setFolderFiles(firstDirPath, dirResult.files)
      }
    }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* TopBar */}
      <header className="h-10 border-b flex items-center px-2 gap-2 shrink-0 overflow-x-auto">
        <span className="font-semibold text-sm px-2 shrink-0">{t('app.name')}</span>
        <Separator orientation="vertical" className="h-5 shrink-0" />

        {/* Open File */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleOpenFile} aria-label={t('toolbar.openFile')}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.openFile')}</TooltipContent>
        </Tooltip>

        {/* Y Axis Up */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeUpAxis === 'y' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setActiveUpAxis('y')}
              aria-label={t('toolbar.yUp')}
            >
              <span className="text-xs font-bold leading-none">Y↑</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.yUp')}</TooltipContent>
        </Tooltip>

        {/* Z Axis Up */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeUpAxis === 'z' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setActiveUpAxis('z')}
              aria-label={t('toolbar.zUp')}
            >
              <span className="text-xs font-bold leading-none">Z↑</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.zUp')}</TooltipContent>
        </Tooltip>

        {/* Perspective View */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ui.cameraMode === 'perspective' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => ui.setCameraMode('perspective')}
              aria-label={t('toolbar.perspective')}
            >
              <Cuboid className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.perspective')}</TooltipContent>
        </Tooltip>

        {/* Orthographic View */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ui.cameraMode === 'orthographic' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => ui.setCameraMode('orthographic')}
              aria-label={t('toolbar.orthographic')}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.orthographic')}</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {/* Fullscreen */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleToggleFullscreen} aria-label={t('toolbar.fullscreen')}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.fullscreen')}</TooltipContent>
        </Tooltip>

        {/* Model Info */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ui.modelInfoOpen ? 'secondary' : 'ghost'}
              size="icon"
              disabled={!activeTool}
              onClick={ui.toggleModelInfo}
              aria-label={t('toolbar.modelInfo')}
            >
              <Info className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.modelInfo')}</TooltipContent>
        </Tooltip>

        {/* Panel toggles */}
        <Button variant="ghost" size="icon" onClick={ui.toggleLeftPanel}>
          {ui.leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={ui.toggleRightPanel}>
          {ui.rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </Button>

        <CacheManager />
        <SettingsDialog />
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden" style={resizing ? { userSelect: 'none' } : undefined}>
        {/* Left Sidebar */}
        {ui.leftPanelOpen && (
          <>
            <aside style={{ width: `${leftPanelPct}%` } as React.CSSProperties} className="border-r flex flex-col shrink-0">
              <div className="p-2 text-xs font-semibold text-muted-foreground">{t('sceneTree.title')}</div>
              <ScrollArea className="flex-1">
                {sceneTree.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4">{t('app.emptySceneTree')}</p>
                ) : (
                  <div className="p-2 min-w-max">
                    {sceneTree.map((node) => (
                      <SceneTreeItem key={node.id} node={node} depth={0} />
                    ))}
                  </div>
                )}
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </aside>
            <ResizeHandle onMouseDown={() => setResizing('left')} />
          </>
        )}

        {/* Center: Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          <WorkspacePage projectId={projectId} />
        </div>

        {/* Right Panel */}
        {(ui.rightPanelOpen || ui.modelInfoOpen) && (
          <>
            <ResizeHandle onMouseDown={() => setResizing('right')} />
            <aside style={{ width: `${rightPanelPct}%` } as React.CSSProperties} className="border-l flex flex-col shrink-0">
              {ui.modelInfoOpen ? <ModelInfoPanel /> : <FileListPanel />}
            </aside>
          </>
        )}
      </div>
    </div>
  )
}