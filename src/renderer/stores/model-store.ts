import { create } from 'zustand'
import type { FormatId } from '@/config/file-formats'

export interface SceneTreeNode {
  id: string
  name: string
  children?: SceneTreeNode[]
  visible: boolean
}

export interface GlbPartInfo {
  partId: string
  meshIndex: number
  name: string
  triangleCount: number
}

interface ModelStats {
  vertices: number
  faces: number
  volume: number
  materialCost: number
}

export type FileSortMode = 'name' | 'type+name'

interface ModelStore {
  glbUrl: string | null
  sceneTree: SceneTreeNode[]
  modelVersion: number
  stats: ModelStats | null

  // R3F: raw model buffer for declarative rendering via ModelGroup
  modelBuffer: ArrayBuffer | null
  modelFormat: FormatId | null

  // STEP conversion loading state
  isConverting: boolean
  setIsConverting: (v: boolean) => void

  // Per-part info from GLB loading (populated by ModelGroup)
  glbPartInfos: GlbPartInfo[]
  setGlbPartInfos: (infos: GlbPartInfo[]) => void

  // Centering offset applied to display meshes (ModelGroup sets this when loading GLB).
  // Topology data from the GLB extension is in original coordinates and must be offset
  // by the negative of this value to align with the centered display meshes.
  modelCenteringOffset: [number, number, number] | null
  setModelCenteringOffset: (offset: [number, number, number] | null) => void

  // File list panel state
  currentFolderPath: string | null
  folderFiles: { name: string; path: string; mtimeMs: number }[]
  selectedFileIndex: number
  fileSortMode: FileSortMode
  setFolderFiles: (folderPath: string | null, files: { name: string; path: string; mtimeMs: number }[]) => void
  setSelectedFileIndex: (index: number) => void
  setFileSortMode: (mode: FileSortMode) => void

  setGLBUrl: (url: string) => void
  setModelVersion: (v: number) => void
  updateStats: (vertices: number, faces: number, materialCost: number) => void
  updateSceneTree: (tree: SceneTreeNode[]) => void
  replaceModel: (buffer: ArrayBuffer) => Promise<void>
  setModelBuffer: (buffer: ArrayBuffer, format: FormatId) => void
  reset: () => void
}

export const useModelStore = create<ModelStore>()((set, get) => ({
  glbUrl: null,
  sceneTree: [],
  modelVersion: 0,
  stats: null,
  modelBuffer: null,
  modelFormat: null,
  isConverting: false,
  glbPartInfos: [],
  modelCenteringOffset: null,

  currentFolderPath: null,
  folderFiles: [],
  selectedFileIndex: -1,
  fileSortMode: 'name',

  setIsConverting: (v) => set({ isConverting: v }),
  setGlbPartInfos: (infos) => set({ glbPartInfos: infos }),
  setModelCenteringOffset: (offset) => set({ modelCenteringOffset: offset }),

  setFolderFiles: (folderPath, files) => set({ currentFolderPath: folderPath, folderFiles: files, selectedFileIndex: -1 }),
  setSelectedFileIndex: (index) => set({ selectedFileIndex: index }),
  setFileSortMode: (mode) => set({ fileSortMode: mode }),

  setGLBUrl: (url) => {
    if (get().glbUrl) URL.revokeObjectURL(get().glbUrl!)
    set({ glbUrl: url })
  },

  setModelVersion: (v) => set({ modelVersion: v }),

  updateStats: (vertices, faces, materialCost) =>
    set({ stats: { vertices, faces, materialCost, volume: 0 } }),

  updateSceneTree: (tree) => set({ sceneTree: tree }),

  replaceModel: async (buffer) => {
    const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }))
    if (get().glbUrl && get().glbUrl !== 'loaded') URL.revokeObjectURL(get().glbUrl!)
    set({ glbUrl: url, modelVersion: get().modelVersion + 1 })
  },

  setModelBuffer: (buffer, format) => {
    set({ modelBuffer: buffer.slice(0), modelFormat: format })
  },

  reset: () => {
    const url = get().glbUrl
    if (url && url !== 'loaded') URL.revokeObjectURL(url)
    set({ glbUrl: null, sceneTree: [], modelVersion: 0, stats: null, modelBuffer: null, modelFormat: null, glbPartInfos: [], modelCenteringOffset: null, isConverting: false, fileSortMode: 'name' })
  },
}))
