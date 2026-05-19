import { describe, it, expect } from 'vitest'
import { useToolStore } from './tool-store'

describe('tool-store', () => {
  it('initial state', () => {
    const state = useToolStore.getState()
    expect(state.transformMode).toBe('translate')
    expect(state.selectionMode).toBe('object')
    expect(state.activeToolMode).toBe('view')
  })

  it('setTransformMode', () => {
    useToolStore.getState().setTransformMode('rotate')
    expect(useToolStore.getState().transformMode).toBe('rotate')

    useToolStore.getState().setTransformMode('scale')
    expect(useToolStore.getState().transformMode).toBe('scale')

    useToolStore.getState().setTransformMode('translate')
    expect(useToolStore.getState().transformMode).toBe('translate')
  })

  it('setSelectionMode', () => {
    useToolStore.getState().setSelectionMode('face')
    expect(useToolStore.getState().selectionMode).toBe('face')

    useToolStore.getState().setSelectionMode('edge')
    expect(useToolStore.getState().selectionMode).toBe('edge')

    useToolStore.getState().setSelectionMode('point')
    expect(useToolStore.getState().selectionMode).toBe('point')

    useToolStore.getState().setSelectionMode('object')
    expect(useToolStore.getState().selectionMode).toBe('object')
  })

  it('setActiveToolMode switches between view and objectTransform', () => {
    useToolStore.getState().setActiveToolMode('objectTransform')
    expect(useToolStore.getState().activeToolMode).toBe('objectTransform')

    useToolStore.getState().setActiveToolMode('view')
    expect(useToolStore.getState().activeToolMode).toBe('view')
  })

  it('transform, selection, and activeTool are independent', () => {
    useToolStore.setState({ transformMode: 'rotate', selectionMode: 'face', activeToolMode: 'objectTransform' })
    expect(useToolStore.getState().transformMode).toBe('rotate')
    expect(useToolStore.getState().selectionMode).toBe('face')
    expect(useToolStore.getState().activeToolMode).toBe('objectTransform')

    useToolStore.getState().setTransformMode('translate')
    expect(useToolStore.getState().transformMode).toBe('translate')
    expect(useToolStore.getState().selectionMode).toBe('face')
    expect(useToolStore.getState().activeToolMode).toBe('objectTransform')
  })
})
