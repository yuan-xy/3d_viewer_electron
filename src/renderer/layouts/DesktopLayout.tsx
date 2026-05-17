import { useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useUIStore } from '@/stores/ui-store'
import { useModelStore } from '@/stores/model-store'
import { useSelectionStore } from '@/stores/selection-store'
import { cn } from '@/lib/utils'
import { stepToGlbCached } from '@/lib/step-converter'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Download
} from 'lucide-react'
import WorkspacePage from '@/pages/WorkspacePage'
import FileListPanel from '@/components/FileListPanel'
import { SettingsDialog } from '@/components/settings/SettingsDialog'

export default function DesktopLayout() {
  const { projectId } = useParams<{ projectId?: string }>()
  const { t } = useTranslation()
  const ui = useUIStore()
  const model = useModelStore()

  const activeTool = useModelStore.getState().glbUrl

  // Reactive compact mode: auto-open/close left panel at 1024px breakpoint
  const isCompactViewport = useMediaQuery('(max-width: 1023px)')

  useEffect(() => {
    useUIStore.setState({ leftPanelOpen: !isCompactViewport })
  }, [isCompactViewport])

  // Keyboard navigation for file list
  useEffect(() => {
    if (!ui.rightPanelOpen || model.folderFiles.length === 0) return

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
          window.electronAPI.readFileAsBase64(file.path).then(async (result) => {
            if (result.success && result.data) {
              const binaryString = atob(result.data)
              const bytes = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }
              const buffer = bytes.buffer
              const ext = file.name.split('.').pop()?.toLowerCase()
              const isStep = ext === 'step' || ext === 'stp'
              if (isStep) {
                try {
                  useModelStore.getState().setIsConverting(true)
                  const { buffer: glbBuffer } = await stepToGlbCached(buffer,
                    { filePath: file.path, mtimeMs: file.mtimeMs },
                    { wasmPath: '/wasm/occt-import-js.wasm' },
                  )
                  useModelStore.getState().setModelBuffer(glbBuffer, 'glb')
                } catch (e) {
                  console.error('[DesktopLayout] STEP conversion failed:', e)
                  toast.error('STEP conversion failed: ' + (e instanceof Error ? e.message : String(e)))
                  return
                } finally {
                  useModelStore.getState().setIsConverting(false)
                }
              } else {
                useModelStore.getState().setModelBuffer(buffer, ext as 'stl' | 'glb' | '3mf')
              }
              useModelStore.getState().setGLBUrl(file.name)
            }
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [ui.rightPanelOpen, model.folderFiles.length, model.selectedFileIndex])

  const handleDownload = useCallback(() => {
    const buffer = useModelStore.getState().modelBuffer
    const format = useModelStore.getState().modelFormat
    if (!buffer) return
    const ext = format === 'stl' ? 'stl' : 'glb'
    const mime = format === 'stl' ? 'application/sla' : 'model/gltf-binary'
    const blob = new Blob([buffer], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `model.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* TopBar */}
      <header className="h-10 border-b flex items-center px-2 gap-2 shrink-0 overflow-x-auto">
        <span className="font-semibold text-sm px-2 shrink-0">{t('app.name')}</span>
        <Separator orientation="vertical" className="h-5 shrink-0" />

        <div className="flex-1" />

        {/* Download */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!activeTool} onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.download')}</TooltipContent>
        </Tooltip>

        {/* Panel toggles */}
        <Button variant="ghost" size="icon" onClick={ui.toggleLeftPanel}>
          {ui.leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={ui.toggleRightPanel}>
          {ui.rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </Button>

        <SettingsDialog />
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        {ui.leftPanelOpen && (
          <aside style={{ width: '15%' } as React.CSSProperties} className="border-r flex flex-col shrink-0">
            <div className="p-2 text-xs font-semibold text-muted-foreground">{t('sceneTree.title')}</div>
            <ScrollArea className="flex-1">
              {model.sceneTree.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4">{t('app.emptySceneTree')}</p>
              ) : (
                <div className="p-2">
                  {model.sceneTree.map((node) => (
                    <div
                      key={node.id}
                      className="text-sm py-1 px-2 rounded hover:bg-accent cursor-pointer"
                      onClick={() => {
                        const { setSelectedReference } = useSelectionStore.getState()
                        setSelectedReference(node.id)
                      }}
                    >
                      {node.name}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </aside>
        )}

        {/* Center: Viewport + StatusBar */}
        <div className="flex-1 flex flex-col min-w-0">
          <WorkspacePage projectId={projectId} />

          {/* StatusBar */}
          <footer className="h-7 border-t flex items-center px-3 gap-2 text-xs text-muted-foreground shrink-0 overflow-x-auto">
            {model.stats ? (
              <>
                <span>{t('status.vertices')}: {model.stats.vertices.toLocaleString()}</span>
                <span>{t('status.faces')}: {model.stats.faces.toLocaleString()}</span>
                <span>{t('status.material')}: {model.stats.materialCost}g</span>
              </>
            ) : (
              <span>{t('app.noModel')}</span>
            )}
          </footer>
        </div>

        {/* Right Panel: File List */}
        {ui.rightPanelOpen && (
          <aside style={{ width: '15%' } as React.CSSProperties} className="border-l flex flex-col shrink-0">
            <FileListPanel />
          </aside>
        )}
      </div>
    </div>
  )
}