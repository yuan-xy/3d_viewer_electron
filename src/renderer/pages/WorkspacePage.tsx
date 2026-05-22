import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModelStore } from '@/stores/model-store'
import { useFileUpload } from '@/hooks/useFileUpload'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import ViewportContainer from '@/components/viewport/ViewportContainer'
import OpenFileDialog from '@/components/OpenFileDialog'
import { stepToGlbCached } from '@/lib/step-converter'
import { ALL_ACCEPT, detectFormat, FORMAT_MAP, getDefaultUpAxis } from '@/config/file-formats'
import { loadFormat } from '@/engine/formatLoaders'
import { setCachedResult } from '@/engine/loaderResultCache'
import { generateThumbnailFromResult } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'

interface WorkspacePageProps {
  projectId?: string
}

export default function WorkspacePage({ projectId }: WorkspacePageProps) {
  const { t } = useTranslation()
  const glbUrl = useModelStore((s) => s.glbUrl)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const isConverting = useModelStore((s) => s.isConverting)
  const hasAnyModel = glbUrl !== null || loadedFiles.length > 0
  const { uploadFile } = useFileUpload({ projectId })
  const [searchParams] = useSearchParams()
  const skipUpload = searchParams.get('skip_upload') === '1' && import.meta.env.DEV
  const [dialogOpen, setDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleNativeOpenFile = useCallback(async () => {
    if (!window.electronAPI) {
      fileInputRef.current?.click()
      return
    }
    const result = await window.electronAPI.openFileDialog()
    if (!result.success || !result.filePaths?.length) return

    // Clear all currently loaded content before loading new files
    useModelStore.getState().reset()

    let firstDirPath: string | null = null

    for (const filePath of result.filePaths) {
      const fileName = filePath.split(/[/\\]/).pop() || filePath
      const dirPath = filePath.slice(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')))
      firstDirPath ??= dirPath

      let format = detectFormat(fileName)
      if (!format) {
        toast.error('Unsupported file format: ' + fileName)
        continue
      }

      try {
        const fileResult = await window.electronAPI.readFile(filePath)
        if (!fileResult.success || !fileResult.data) {
          toast.error('Load failed: ' + (fileResult.error || 'unknown error'))
          continue
        }
        let buffer = fileResult.data

        if (format === 'step') {
          try {
            useModelStore.getState().setIsConverting(true)
            const { buffer: glbBuffer } = await stepToGlbCached(buffer,
              { filePath, mtimeMs: Date.now() },
              { wasmPath: '/wasm/occt-import-js.wasm' },
            )
            buffer = glbBuffer
            format = 'glb'
          } catch (e) {
            console.error('[WorkspacePage] STEP conversion failed:', e)
            toast.error('STEP conversion failed: ' + (e instanceof Error ? e.message : String(e)))
            continue
          } finally {
            useModelStore.getState().setIsConverting(false)
          }
        }

        // Parse once
        const loadResult = await loadFormat(buffer, format, filePath)
        const fileId = crypto.randomUUID()
        setCachedResult(fileId, loadResult)

        // Thumbnail as byproduct
        const upAxis = getDefaultUpAxis(format, buffer)
        generateThumbnailFromResult(loadResult.meshes, loadResult.objects, upAxis)
          .then(blob => {
            if (blob) putThumbnail(`${filePath}|${Date.now()}`, blob)
          })

        useModelStore.getState().addLoadedFile({
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
      } catch (e) {
        useModelStore.getState().setIsConverting(false)
        toast.error('Load failed: ' + String(e))
      }
    }

    if (firstDirPath) {
      const dirResult = await window.electronAPI.readDirectory(firstDirPath)
      if (dirResult.success && dirResult.files) {
        useModelStore.getState().setFolderFiles(firstDirPath, dirResult.files)
      }
    }
  }, [])

  const processFileLocally = useCallback(async (file: File) => {
    const format = detectFormat(file.name)
    if (!format) {
      console.error('[WorkspacePage] unsupported format:', file.name)
      return
    }
    const rawBuffer = await file.arrayBuffer()

    if (format === 'step') {
      try {
        useModelStore.getState().setIsConverting(true)
        const filePath = window.electronAPI?.getFilePath(file) ?? file.name
        const { buffer: glbBuffer } = await stepToGlbCached(rawBuffer,
          { filePath, mtimeMs: file.lastModified },
          { wasmPath: '/wasm/occt-import-js.wasm' },
        )
        useModelStore.getState().setModelBuffer(glbBuffer, 'glb')
      } catch (e) {
        console.error('[WorkspacePage] STEP conversion failed:', e)
        toast.error('STEP conversion failed: ' + (e instanceof Error ? e.message : String(e)))
        return
      } finally {
        useModelStore.getState().setIsConverting(false)
      }
    } else {
      useModelStore.getState().setModelBuffer(rawBuffer, format)
      const filePath = window.electronAPI?.getFilePath(file) ?? null
      useModelStore.getState().setModelFilePath(filePath)
    }
    useModelStore.getState().setGLBUrl(file.name)
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (skipUpload) {
      processFileLocally(file)
    } else {
      uploadFile(file)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (skipUpload) {
      processFileLocally(file)
    } else {
      uploadFile(file)
    }
  }

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const file = e.clipboardData?.files?.[0]
      if (!file) return
      e.preventDefault()
      if (skipUpload) {
        processFileLocally(file)
      } else {
        uploadFile(file)
      }
    },
    [skipUpload, processFileLocally, uploadFile],
  )

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  return (
    <div className="relative flex-1" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      <ViewportContainer />

      {!hasAnyModel && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="flex flex-col items-center gap-4 p-12 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/50 transition-colors text-muted-foreground pointer-events-auto"
            onClick={handleNativeOpenFile}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNativeOpenFile() }}
          >
            <Upload className="h-12 w-12" />
            <p className="text-lg font-medium">{t('chat.uploadFormats')}</p>
            <p className="text-sm">{t('chat.uploadHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALL_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      )}

      <OpenFileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onFileSelected={(file) => {
          if (skipUpload) {
            processFileLocally(file)
          } else {
            uploadFile(file)
          }
          setDialogOpen(false)
        }}
      />

      {isConverting && (
        <div
          id="step-loading-overlay"
          data-testid="step-loading-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
            zIndex: 30,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div style={{
            width: 40,
            height: 40,
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'step-loading-spin 0.8s linear infinite',
          }} />
          <p style={{ color: '#fff', marginTop: 16, fontSize: 14, fontWeight: 500 }}>
            Loading...
          </p>
          <style>{`
            @keyframes step-loading-spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
