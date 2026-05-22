import { create } from 'zustand'
import type { FormatId, FileGroup, UnitSystem, UpAxis } from '@/config/file-formats'
import { getDefaultUpAxis } from '@/config/file-formats'
import { clearAllResults, releaseResult, clearLoaded } from '@/engine/loaderResultCache'

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

export interface LoadedFileModel {
  id: string
  fileName: string
  filePath: string
  mtimeMs?: number
  buffer: ArrayBuffer
  format: FormatId
  sceneTree: SceneTreeNode[]
  glbPartInfos: GlbPartInfo[]
  modelCenteringOffset: [number, number, number] | null
  sourceUnit: UnitSystem
  fileGroup: FileGroup
  loadingPhase: LoadingPhase
}

export type FileSortMode = 'name' | 'type+name'
export type SortOrder = 'asc' | 'desc'

export type LoadingPhase = 'idle' | 'loading' | 'done' | 'error'

function buildCombinedTree(files: LoadedFileModel[], prevTree?: SceneTreeNode[]): SceneTreeNode[] {
  // Preserve expanded/visible state from the previous combined tree
  const prevMap = new Map<string, { expanded?: boolean; visible?: boolean }>()
  if (prevTree) {
    const walk = (nodes: readonly SceneTreeNode[]) => {
      for (const n of nodes) {
        prevMap.set(n.id, { expanded: n.expanded, visible: n.visible })
        if (n.children) walk(n.children)
      }
    }
    walk(prevTree)
  }

  function preserveState(node: SceneTreeNode): SceneTreeNode {
    const prev = prevMap.get(node.id)
    const children = node.children?.map(preserveState)
    return {
      ...node,
      expanded: prev?.expanded ?? node.expanded,
      visible: prev?.visible ?? node.visible,
      ...(children ? { children } : {}),
    }
  }

  const tree = files.map((file) => ({
    id: `file:${file.id}`,
    name: file.fileName,
    visible: true,
    expanded: true,
    ...(file.sceneTree.length > 0 ? { children: file.sceneTree } : {}),
  }))

  return tree.map(preserveState)
}

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

  /** Detected or default unit system for the loaded file */
  sourceUnit: UnitSystem
  setSourceUnit: (unit: UnitSystem) => void

  /** File format group (mesh/cad/point/volume/animation/gcode/other) */
  fileGroup: FileGroup
  setFileGroup: (group: FileGroup) => void

  /** Active coordinate-system up axis — auto-set on load, manually togglable via toolbar */
  activeUpAxis: UpAxis
  setActiveUpAxis: (axis: UpAxis) => void

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
  sortOrder: SortOrder
  setFolderFiles: (folderPath: string | null, files: { name: string; path: string; mtimeMs: number }[]) => void
  setSelectedFileIndex: (index: number) => void
  setFileSortMode: (mode: FileSortMode) => void
  setSortOrder: (order: SortOrder) => void

  setGLBUrl: (url: string) => void
  setModelVersion: (v: number) => void
  updateSceneTree: (tree: SceneTreeNode[]) => void
  toggleNodeExpanded: (nodeId: string) => void
  toggleNodeVisible: (nodeId: string) => void
  replaceModel: (buffer: ArrayBuffer) => Promise<void>
  setModelBuffer: (buffer: ArrayBuffer, format: FormatId) => void
  setModelFilePath: (path: string | null) => void
  reset: () => void

  // Multi-file state
  loadedFiles: LoadedFileModel[]
  activeFileId: string | null
  addLoadedFile: (file: LoadedFileModel) => void
  removeLoadedFile: (id: string) => void
  setActiveFile: (id: string) => void
  updateFileSceneTree: (fileId: string, tree: SceneTreeNode[]) => void
  updateFilePartInfos: (fileId: string, infos: GlbPartInfo[]) => void
  updateFileCenteringOffset: (fileId: string, offset: [number, number, number] | null) => void
  updateFileLoadingPhase: (fileId: string, phase: LoadingPhase) => void

  /** Check if a file path is among the loaded files */
  isFileLoaded: (filePath: string) => boolean
}

function toggleNodeInTree(
  nodes: SceneTreeNode[],
  nodeId: string,
  key: 'expanded' | 'visible',
): SceneTreeNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      const newValue = !node[key]
      if (key === 'visible' && node.children && node.children.length > 0) {
        return {
          ...node,
          visible: newValue,
          children: setAllVisible(node.children, newValue),
        }
      }
      return { ...node, [key]: newValue }
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: toggleNodeInTree(node.children, nodeId, key) }
    }
    return node
  })
}

function setAllVisible(nodes: SceneTreeNode[], visible: boolean): SceneTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    visible,
    ...(node.children && node.children.length > 0 ? { children: setAllVisible(node.children, visible) } : {}),
  }))
}

/** Copy expanded/visible state from the combined tree back to each file's internal scene tree.
 *  This ensures ModelGroup (which receives file.sceneTree) stays in sync with the UI tree. */
function syncCombinedToFiles(combined: SceneTreeNode[], files: LoadedFileModel[]): LoadedFileModel[] {
  return files.map((file) => {
    const fileNode = combined.find((n) => n.id === `file:${file.id}`)
    if (!fileNode?.children) return file
    return { ...file, sceneTree: fileNode.children }
  })
}

function syncActiveFileFields(
  file: LoadedFileModel | undefined,
  allFiles: LoadedFileModel[],
  prevTree?: SceneTreeNode[],
) {
  if (!file) {
    return {
      activeFileId: null,
      glbUrl: null,
      modelBuffer: null,
      modelFormat: null,
      modelFilePath: null,
      __loadingPhase: 'idle' as LoadingPhase,
      sourceUnit: 'millimeter' as UnitSystem,
      fileGroup: 'mesh' as FileGroup,
      glbPartInfos: [] as GlbPartInfo[],
      modelCenteringOffset: null,
      sceneTree: buildCombinedTree(allFiles, prevTree),
    }
  }
  return {
    activeFileId: file.id,
    glbUrl: file.fileName,
    modelBuffer: file.buffer,
    modelFormat: file.format,
    modelFilePath: file.filePath,
    __loadingPhase: file.loadingPhase,
    sourceUnit: file.sourceUnit,
    fileGroup: file.fileGroup,
    glbPartInfos: file.glbPartInfos,
    modelCenteringOffset: file.modelCenteringOffset,
    sceneTree: buildCombinedTree(allFiles, prevTree),
  }
}

export const useModelStore = create<ModelStore>()((set, get) => ({
  glbUrl: null,
  sceneTree: [],
  modelVersion: 0,
  modelBuffer: null,
  modelFormat: null,
  modelFilePath: null,
  __loadingPhase: 'idle',
  sourceUnit: 'millimeter',
  fileGroup: 'mesh',
  isConverting: false,
  glbPartInfos: [],
  modelCenteringOffset: null,

  activeUpAxis: 'z',

  currentFolderPath: null,
  folderFiles: [],
  selectedFileIndex: -1,
  fileSortMode: 'name',
  sortOrder: 'asc',

  // Multi-file state
  loadedFiles: [],
  activeFileId: null,

  setIsConverting: (v) => set({ isConverting: v }),
  setLoadingPhase: (phase) => set({ __loadingPhase: phase }),
  setSourceUnit: (unit) => set({ sourceUnit: unit }),
  setFileGroup: (group) => set({ fileGroup: group }),
  setGlbPartInfos: (infos) => set({ glbPartInfos: infos }),
  setModelCenteringOffset: (offset) => set({ modelCenteringOffset: offset }),
  setActiveUpAxis: (axis) => set({ activeUpAxis: axis }),

  setFolderFiles: (folderPath, files) => set({ currentFolderPath: folderPath, folderFiles: files, selectedFileIndex: -1 }),
  setSelectedFileIndex: (index) => set({ selectedFileIndex: index }),
  setFileSortMode: (mode) => set({ fileSortMode: mode }),
  setSortOrder: (order) => set({ sortOrder: order }),

  setGLBUrl: (url) => {
    if (get().glbUrl) URL.revokeObjectURL(get().glbUrl!)
    set({ glbUrl: url })
  },

  setModelVersion: (v) => set({ modelVersion: v }),

  updateSceneTree: (tree) => set({ sceneTree: tree }),

  toggleNodeExpanded: (nodeId) => {
    set((state) => {
      const newTree = toggleNodeInTree(state.sceneTree, nodeId, 'expanded')
      return { sceneTree: newTree, loadedFiles: syncCombinedToFiles(newTree, state.loadedFiles) }
    })
  },

  toggleNodeVisible: (nodeId) => {
    set((state) => {
      const newTree = toggleNodeInTree(state.sceneTree, nodeId, 'visible')
      return { sceneTree: newTree, loadedFiles: syncCombinedToFiles(newTree, state.loadedFiles) }
    })
  },

  replaceModel: async (buffer) => {
    const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }))
    if (get().glbUrl && get().glbUrl !== 'loaded') URL.revokeObjectURL(get().glbUrl!)
    set({ glbUrl: url, modelVersion: get().modelVersion + 1 })
  },

  setModelBuffer: (buffer, format) => {
    const sliced = buffer.slice(0)
    const defaultAxis = getDefaultUpAxis(format, sliced)
    set({ modelBuffer: sliced, modelFormat: format, __loadingPhase: 'loading', activeUpAxis: defaultAxis })
  },

  setModelFilePath: (path) => set({ modelFilePath: path }),

  reset: () => {
    const url = get().glbUrl
    if (url && url !== 'loaded') URL.revokeObjectURL(url)
    for (const file of get().loadedFiles) {
      releaseResult(file.id)
      clearLoaded(file.id)
    }
    clearAllResults()
    set({
      glbUrl: null, sceneTree: [], modelVersion: 0, modelBuffer: null, modelFormat: null,
      modelFilePath: null, __loadingPhase: 'idle', sourceUnit: 'millimeter', fileGroup: 'mesh',
      glbPartInfos: [], modelCenteringOffset: null, isConverting: false,
      fileSortMode: 'name', sortOrder: 'asc', activeUpAxis: 'z',
      loadedFiles: [], activeFileId: null,
    })
  },

  // Multi-file actions
  addLoadedFile: (file) =>
    set((state) => {
      const newFiles = [...state.loadedFiles, file]
      const isFirst = state.loadedFiles.length === 0
      return {
        loadedFiles: newFiles,
        ...(isFirst ? syncActiveFileFields(file, newFiles, state.sceneTree) : { sceneTree: buildCombinedTree(newFiles, state.sceneTree) }),
      }
    }),

  removeLoadedFile: (id) => {
    releaseResult(id)
    clearLoaded(id)
    set((state) => {
      const newFiles = state.loadedFiles.filter((f) => f.id !== id)
      if (newFiles.length === 0) {
        return {
          loadedFiles: [],
          activeFileId: null,
          glbUrl: null,
          sceneTree: [],
          modelBuffer: null,
          modelFormat: null,
          modelFilePath: null,
          __loadingPhase: 'idle' as LoadingPhase,
          sourceUnit: 'millimeter' as UnitSystem,
          fileGroup: 'mesh' as FileGroup,
          glbPartInfos: [] as GlbPartInfo[],
          modelCenteringOffset: null,
        }
      }
      const newActive = state.activeFileId === id
        ? newFiles[newFiles.length - 1]
        : newFiles.find((f) => f.id === state.activeFileId) ?? newFiles[0]
      return {
        loadedFiles: newFiles,
        ...syncActiveFileFields(newActive, newFiles, state.sceneTree),
      }
    })
  },

  setActiveFile: (id) =>
    set((state) => {
      const file = state.loadedFiles.find((f) => f.id === id)
      if (!file) return {}
      return syncActiveFileFields(file, state.loadedFiles, state.sceneTree)
    }),

  updateFileSceneTree: (fileId, tree) =>
    set((state) => {
      const newFiles = state.loadedFiles.map((f) =>
        f.id === fileId ? { ...f, sceneTree: tree } : f,
      )
      const newTree = buildCombinedTree(newFiles, state.sceneTree)
      const syncedFiles = syncCombinedToFiles(newTree, newFiles)
      const synced = state.activeFileId === fileId
        ? { sceneTree: newTree }
        : {}
      return { loadedFiles: syncedFiles, ...synced }
    }),

  updateFilePartInfos: (fileId, infos) =>
    set((state) => {
      const newFiles = state.loadedFiles.map((f) =>
        f.id === fileId ? { ...f, glbPartInfos: infos } : f,
      )
      const synced = state.activeFileId === fileId
        ? { glbPartInfos: infos }
        : {}
      return { loadedFiles: newFiles, ...synced }
    }),

  updateFileCenteringOffset: (fileId, offset) =>
    set((state) => {
      const newFiles = state.loadedFiles.map((f) =>
        f.id === fileId ? { ...f, modelCenteringOffset: offset } : f,
      )
      const synced = state.activeFileId === fileId
        ? { modelCenteringOffset: offset }
        : {}
      return { loadedFiles: newFiles, ...synced }
    }),

  updateFileLoadingPhase: (fileId, phase) =>
    set((state) => {
      const newFiles = state.loadedFiles.map((f) =>
        f.id === fileId ? { ...f, loadingPhase: phase } : f,
      )
      const synced = state.activeFileId === fileId
        ? { __loadingPhase: phase }
        : {}
      return { loadedFiles: newFiles, ...synced }
    }),

  isFileLoaded: (filePath) => {
    return get().loadedFiles.some((f) => f.filePath === filePath)
  },
}))
