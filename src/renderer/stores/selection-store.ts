import { create } from 'zustand'

export interface SelectionStore {
  hoveredReferenceId: string | null
  selectedReferenceId: string | null

  setHoveredReference: (id: string | null) => void
  setSelectedReference: (id: string | null) => void
  clearSelection: () => void
}

export const useSelectionStore = create<SelectionStore>()((set) => ({
  hoveredReferenceId: null,
  selectedReferenceId: null,

  setHoveredReference: (id) => set({ hoveredReferenceId: id }),
  setSelectedReference: (id) => set({ selectedReferenceId: id }),
  clearSelection: () => set({ hoveredReferenceId: null, selectedReferenceId: null }),
}))
