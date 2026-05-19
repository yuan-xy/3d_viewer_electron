import { create } from 'zustand'

type TransformMode = 'translate' | 'rotate' | 'scale'
export type SelectionMode = 'object' | 'face' | 'edge' | 'point'
export type ActiveToolMode = 'view' | 'objectTransform'

interface ToolStore {
  transformMode: TransformMode
  selectionMode: SelectionMode
  activeToolMode: ActiveToolMode

  setTransformMode: (mode: TransformMode) => void
  setSelectionMode: (mode: SelectionMode) => void
  setActiveToolMode: (mode: ActiveToolMode) => void
}

export const useToolStore = create<ToolStore>()((set) => ({
  transformMode: 'translate',
  selectionMode: 'object',
  activeToolMode: 'view',

  setTransformMode: (mode) => set({ transformMode: mode }),
  setSelectionMode: (mode) => set({ selectionMode: mode }),
  setActiveToolMode: (mode) => set({ activeToolMode: mode }),
}))