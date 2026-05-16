import { useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModelStore } from '@/stores/model-store'
import { useFileUpload } from '@/hooks/useFileUpload'
import { Upload } from 'lucide-react'
import ViewportContainer from '@/components/viewport/ViewportContainer'

interface WorkspacePageProps {
  projectId?: string
}

export default function WorkspacePage({ projectId }: WorkspacePageProps) {
  const { t } = useTranslation()
  const glbUrl = useModelStore((s) => s.glbUrl)
  const { uploadFile } = useFileUpload({ projectId })
  const [searchParams] = useSearchParams()
  const skipUpload = searchParams.get('skip_upload') === '1' && import.meta.env.DEV

  const processFileLocally = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['stl', 'glb', '3mf', 'step', 'stp'].includes(ext)) {
      console.error('[WorkspacePage] unsupported format:', ext)
      return
    }
    const fmt = ext as 'stl' | 'glb' | '3mf' | 'step' | 'stp'
    file.arrayBuffer().then((buffer) => {
      useModelStore.getState().setModelBuffer(buffer, fmt)
      useModelStore.getState().setGLBUrl(file.name)
    })
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
              accept=".stl,.glb,.3mf,.step,.stp"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>
      )}
    </div>
  )
}
