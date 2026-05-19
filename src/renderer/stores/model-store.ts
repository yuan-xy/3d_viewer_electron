import { create } from 'zustand'
import type { FormatId } from '@/config/file-formats'

export interface SceneTreeNode {
  id: string
  name: string
  children?: SceneTreeNode[]
  visible: boolean
  expanded?: boolean
  meshIndex?: number
}

export interface GlbPartInfo {
  partId: string
  meshIndex: number
  name: string
  triangleCount: number
}

export type FileSortMode = 'name' | 'type+name'

export type LoadingPhase = 'idle' | 'loading' | 'done' | 'error'

interface ModelStore {
  glbUrl: string | null
  sceneTree: SceneTreeNode[]
  modelVersion: number

  // R3F: raw model buffer for declarative rendering via ModelGroup
  modelBuffer: ArrayBuffer | null
  modelFormat: FormatId | null
  /** File path of the loaded model (needed by glTF to resolve external buffer/image URIs) */
  modelFilePath: string | null

  /** Loading phase for E2E test conditional waits (replaces fixed timeouts) */
  __loadingPhase: LoadingPhase
  setLoadingPhase: (phase: LoadingPhase) => void

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
  updateSceneTree: (tree: SceneTreeNode[]) => void
  toggleNodeExpanded: (nodeId: string) => void
  toggleNodeVisible: (nodeId: string) => void
  replaceModel: (buffer: ArrayBuffer) => Promise<void>
  setModelBuffer: (buffer: ArrayBuffer, format: FormatId) => void
  setModelFilePath: (path: string | null) => void
  reset: () => void
}

function toggleNodeInTree(
  nodes: SceneTreeNode[],
  nodeId: string,
  key: 'expanded' | 'visible',
): SceneTreeNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, [key]: !node[key] }
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: toggleNodeInTree(node.children, nodeId, key) }
    }
    return node
  })
}

export const useModelStore = create<ModelStore>()((set, get) => ({
  glbUrl: null,
  sceneTree: [],
  modelVersion: 0,
  modelBuffer: null,
  modelFormat: null,
  modelFilePath: null,
  __loadingPhase: 'idle',
  isConverting: false,
  glbPartInfos: [],
  modelCenteringOffset: null,

  currentFolderPath: null,
  folderFiles: [],
  selectedFileIndex: -1,
  fileSortMode: 'name',

  setIsConverting: (v) => set({ isConverting: v }),
  setLoadingPhase: (phase) => set({ __loadingPhase: phase }),
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

  updateSceneTree: (tree) => set({ sceneTree: tree }),

  toggleNodeExpanded: (nodeId) => {
    set((state) => ({ sceneTree: toggleNodeInTree(state.sceneTree, nodeId, 'expanded') }))
  },

  toggleNodeVisible: (nodeId) => {
    set((state) => ({ sceneTree: toggleNodeInTree(state.sceneTree, nodeId, 'visible') }))
  },

  replaceModel: async (buffer) => {
    const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }))
    if (get().glbUrl && get().glbUrl !== 'loaded') URL.revokeObjectURL(get().glbUrl!)
    set({ glbUrl: url, modelVersion: get().modelVersion + 1 })
  },

  setModelBuffer: (buffer, format) => {
    set({ modelBuffer: buffer.slice(0), modelFormat: format, __loadingPhase: 'loading' })
  },

  setModelFilePath: (path) => set({ modelFilePath: path }),

  reset: () => {
    const url = get().glbUrl
    if (url && url !== 'loaded') URL.revokeObjectURL(url)
    set({ glbUrl: null, sceneTree: [], modelVersion: 0, modelBuffer: null, modelFormat: null, modelFilePath: null, __loadingPhase: 'idle', glbPartInfos: [], modelCenteringOffset: null, isConverting: false, fileSortMode: 'name' })
  },
}))
