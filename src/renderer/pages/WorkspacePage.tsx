import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModelStore } from '@/stores/model-store'
import { useFileUpload } from '@/hooks/useFileUpload'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import ViewportContainer from '@/components/viewport/ViewportContainer'
import OpenFileDialog from '@/components/OpenFileDialog'
import { stepToGlbCached } from '@/lib/step-converter'
import { ALL_ACCEPT, detectFormat } from '@/config/file-formats'

interface WorkspacePageProps {
  projectId?: string
}

export default function WorkspacePage({ projectId }: WorkspacePageProps) {
  const { t } = useTranslation()
  const glbUrl = useModelStore((s) => s.glbUrl)
  const isConverting = useModelStore((s) => s.isConverting)
  const { uploadFile } = useFileUpload({ projectId })
  const [searchParams] = useSearchParams()
  const skipUpload = searchParams.get('skip_upload') === '1' && import.meta.env.DEV
  const [dialogOpen, setDialogOpen] = useState(false)

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

      {!glbUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <label className="flex flex-col items-center gap-4 p-12 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/50 transition-colors text-muted-foreground pointer-events-auto">
            <Upload className="h-12 w-12" />
            <p className="text-lg font-medium">{t('chat.uploadFormats')}</p>
            <p className="text-sm">{t('chat.uploadHint')}</p>
            <input
              type="file"
              accept={ALL_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
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
