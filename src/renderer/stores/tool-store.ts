import { create } from 'zustand'

type ToolMode = 'view' | 'objectTransform' | 'cut' | 'hole' | 'extrude' | 'measure' | 'boolean'
type TransformMode = 'translate' | 'rotate' | 'scale'
export type SelectionMode = 'object' | 'face' | 'edge' | 'point'

interface ToolStore {
  activeToolId: string | null
  activeToolMode: ToolMode
  transformMode: TransformMode
  selectionMode: SelectionMode
  toolParams: Record<string, unknown>

  activateTool: (id: string, mode: ToolMode) => void
  setTransformMode: (mode: TransformMode) => void
  setSelectionMode: (mode: SelectionMode) => void
  deactivateTool: () => void
  setToolParams: (params: Record<string, unknown>) => void
}

export const useToolStore = create<ToolStore>()((set) => ({
  activeToolId: null,
  activeToolMode: 'view',
  transformMode: 'translate',
  selectionMode: 'object',
  toolParams: {},

  activateTool: (id, mode) => set({ activeToolId: id, activeToolMode: mode, toolParams: {} }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setSelectionMode: (mode) => set({ selectionMode: mode }),
  deactivateTool: () => set({ activeToolId: null, activeToolMode: 'view', toolParams: {} }),
  setToolParams: (params) => set((s) => ({ toolParams: { ...s.toolParams, ...params } })),
}))
