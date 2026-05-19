import { create } from 'zustand'

type TransformMode = 'translate' | 'rotate' | 'scale'
export type SelectionMode = 'object' | 'face' | 'edge' | 'point'

interface ToolStore {
  transformMode: TransformMode
  selectionMode: SelectionMode

  setTransformMode: (mode: TransformMode) => void
  setSelectionMode: (mode: SelectionMode) => void
}

export const useToolStore = create<ToolStore>()((set) => ({
  transformMode: 'translate',
  selectionMode: 'object',

  setTransformMode: (mode) => set({ transformMode: mode }),
  setSelectionMode: (mode) => set({ selectionMode: mode }),
}))