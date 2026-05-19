import { useState, useCallback } from 'react'
import { useModelStore } from '@/stores/model-store'
import { toast } from 'sonner'
import { stepToGlbCached, startPreCache } from '@/lib/step-converter'
import { detectFormat, ALL_EXTENSIONS_NO_DOT } from '@/config/file-formats'

interface UseFileUploadOptions {
  projectId?: string
}

export function useFileUpload({ projectId }: UseFileUploadOptions = {}) {
  const setModelBuffer = useModelStore((s) => s.setModelBuffer)
  const setModelFilePath = useModelStore((s) => s.setModelFilePath)
  const setGLBUrl = useModelStore((s) => s.setGLBUrl)
  const setFolderFiles = useModelStore((s) => s.setFolderFiles)
  const [isUploading, setIsUploading] = useState(false)

  const uploadFile = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!ext || !ALL_EXTENSIONS_NO_DOT.includes(ext)) {
        toast.error(`Unsupported file format: .${ext ?? 'unknown'}`)
        return
      }
      const format = detectFormat(file.name)

      setIsUploading(true)

      try {
        const rawBuffer = await file.arrayBuffer()

        if (format === 'step') {
          useModelStore.getState().setIsConverting(true)
          const filePath = window.electronAPI?.getFilePath(file) ?? file.name
          const { buffer: glbBuffer } = await stepToGlbCached(rawBuffer,
            { filePath, mtimeMs: file.lastModified },
            { wasmPath: '/wasm/occt-import-js.wasm' },
          )
          useModelStore.getState().setIsConverting(false)
          setModelBuffer(glbBuffer, 'glb')
        } else if (format) {
          setModelBuffer(rawBuffer, format)
          const filePath = window.electronAPI?.getFilePath(file) ?? null
          setModelFilePath(filePath)
        } else {
          toast.error(`Unsupported file format: ${file.name}`)
          setIsUploading(false)
          return
        }
        setGLBUrl(file.name)

        // Scan folder for other model files if in Electron environment
        if (window.electronAPI) {
          try {
            const filePath = window.electronAPI.getFilePath(file)
            if (filePath) {
              const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
              const folderPath = lastSep > 0 ? filePath.slice(0, lastSep) : null
              if (folderPath) {
                const result = await window.electronAPI.readDirectory(folderPath)
                if (result.success && result.files) {
                  setFolderFiles(folderPath, result.files)
                  const idx = result.files.findIndex(f => f.name === file.name)
                  if (idx !== -1) {
                    useModelStore.getState().setSelectedFileIndex(idx)
                  }
                  // Schedule background pre-caching for uncached STEP files
                  setTimeout(() => {
                    startPreCache(result.files, '/wasm/occt-import-js.wasm')
                  }, 1000)
                }
              }
            }
          } catch (e) {
            console.warn('[useFileUpload] Failed to read directory:', e)
          }
        }
      } catch (err) {
        useModelStore.getState().setIsConverting(false)
        console.error('[useFileUpload] upload failed:', err)
        const message = err instanceof Error ? err.message : String(err)
        toast.error(message || 'Load failed')
      } finally {
        setIsUploading(false)
      }
    },
    [projectId, setModelBuffer, setGLBUrl, setFolderFiles],
  )

  return { uploadFile, isUploading }
}
