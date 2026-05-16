import { useState, useCallback } from 'react'
import { useModelStore } from '@/stores/model-store'
import { toast } from 'sonner'

const ALLOWED_EXTENSIONS = ['stl', 'glb', '3mf', 'step', 'stp'] as const
type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number]

interface UseFileUploadOptions {
  projectId?: string
}

export function useFileUpload({ projectId }: UseFileUploadOptions = {}) {
  const setModelBuffer = useModelStore((s) => s.setModelBuffer)
  const setGLBUrl = useModelStore((s) => s.setGLBUrl)
  const setFolderFiles = useModelStore((s) => s.setFolderFiles)
  const [isUploading, setIsUploading] = useState(false)

  const uploadFile = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
        toast.error(`不支持的文件格式: .${ext ?? 'unknown'}`)
        return
      }
      const format = ext as AllowedExtension

      setIsUploading(true)

      try {
        // Process file locally only - no server upload
        const buffer = await file.arrayBuffer()
        setModelBuffer(buffer, format as 'stl' | 'glb' | '3mf')
        setGLBUrl(file.name)

        // Scan folder for other model files if in Electron environment
        if (window.electronAPI) {
          const filePath = (file as any).path
          if (filePath) {
            try {
              const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
              const folderPath = lastSep > 0 ? filePath.slice(0, lastSep) : null
              if (folderPath) {
                const result = await window.electronAPI.readDirectory(folderPath)
                if (result.success && result.files) {
                  setFolderFiles(folderPath, result.files)
                }
              }
            } catch (e) {
              console.warn('[useFileUpload] Failed to read directory:', e)
            }
          }
        }
      } catch (err) {
        console.error('[useFileUpload] upload failed:', err)
        const message = err instanceof Error ? err.message : String(err)
        toast.error(message || '文件读取失败')
      } finally {
        setIsUploading(false)
      }
    },
    [projectId, setModelBuffer, setGLBUrl, setFolderFiles],
  )

  return { uploadFile, isUploading }
}