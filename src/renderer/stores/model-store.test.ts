/**
 * Tests for model-store — pure Zustand store, no DOM dependency.
 * Focuses on toggleNodeInTree recursive logic, state transitions, and edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useModelStore } from './model-store'
import type { SceneTreeNode } from './model-store'

// Exported for testing — the recursive tree utility
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

function makeTree(): SceneTreeNode[] {
  return [
    {
      id: 'root',
      name: 'Root',
      visible: true,
      expanded: true,
      children: [
        { id: 'child1', name: 'Child 1', visible: true, expanded: false },
        {
          id: 'child2',
          name: 'Child 2',
          visible: true,
          expanded: true,
          children: [
            { id: 'grandchild1', name: 'GC1', visible: true, expanded: false },
          ],
        },
      ],
    },
  ]
}

describe('toggleNodeInTree', () => {
  it('toggles expanded on root node', () => {
    const tree = makeTree()
    const result = toggleNodeInTree(tree, 'root', 'expanded')
    expect(result[0].expanded).toBe(false)
    expect(result[0].children![0].expanded).toBe(false) // unchanged
  })

  it('toggles visible on root node and cascades to all children', () => {
    const tree = makeTree()
    const result = toggleNodeInTree(tree, 'root', 'visible')
    expect(result[0].visible).toBe(false)
    // All descendants hidden
    expect(result[0].children![0].visible).toBe(false)
    expect(result[0].children![1].visible).toBe(false)
    expect(result[0].children![1].children![0].visible).toBe(false)
  })

  it('toggles visible on child does not affect parent or sibling', () => {
    const tree = makeTree()
    const result = toggleNodeInTree(tree, 'child1', 'visible')
    expect(result[0].visible).toBe(true) // parent unchanged
    expect(result[0].children![0].visible).toBe(false) // toggled
    expect(result[0].children![1].visible).toBe(true) // sibling unchanged
  })

  it('cascade double toggle returns all to original state', () => {
    const tree = makeTree()
    const once = toggleNodeInTree(tree, 'root', 'visible')
    const twice = toggleNodeInTree(once, 'root', 'visible')
    expect(twice).toEqual(tree)
  })

  it('toggling parent visible cascades to grandchildren', () => {
    const tree = makeTree()
    const result = toggleNodeInTree(tree, 'child2', 'visible')
    expect(result[0].children![1].visible).toBe(false)
    expect(result[0].children![1].children![0].visible).toBe(false) // grandchild cascaded
    expect(result[0].children![0].visible).toBe(true) // sibling unaffected
  })

  it('toggles expanded on nested node', () => {
    const tree = makeTree()
    const result = toggleNodeInTree(tree, 'child1', 'expanded')
    expect(result[0].expanded).toBe(true) // root unchanged
    expect(result[0].children![0].expanded).toBe(true)
  })

  it('toggles visible on deeply nested node', () => {
    const tree = makeTree()
    const result = toggleNodeInTree(tree, 'grandchild1', 'visible')
    expect(result[0].children![1].children![0].visible).toBe(false)
  })

  it('double toggle returns to original state', () => {
    const tree = makeTree()
    const once = toggleNodeInTree(tree, 'child2', 'expanded')
    const twice = toggleNodeInTree(once, 'child2', 'expanded')
    expect(twice).toEqual(tree)
  })

  it('non-existent node id returns unchanged tree', () => {
    const tree = makeTree()
    const result = toggleNodeInTree(tree, 'nonexistent', 'visible')
    expect(result).toEqual(tree)
  })

  it('returns new array (immutable)', () => {
    const tree = makeTree()
    const result = toggleNodeInTree(tree, 'root', 'expanded')
    expect(result).not.toBe(tree)
    expect(result[0]).not.toBe(tree[0])
  })

  it('does not affect siblings structurally', () => {
    const tree = makeTree()
    const result = toggleNodeInTree(tree, 'child1', 'visible')
    // child2 unchanged in values, though new reference due to children recursion
    expect(result[0].children![1].id).toBe(tree[0].children![1].id)
    expect(result[0].children![1].visible).toBe(tree[0].children![1].visible)
  })
})

describe('model-store', () => {
  beforeEach(() => {
    useModelStore.getState().reset()
  })

  it('initial state', () => {
    const s = useModelStore.getState()
    expect(s.glbUrl).toBeNull()
    expect(s.sceneTree).toEqual([])
    expect(s.modelVersion).toBe(0)
    expect(s.modelBuffer).toBeNull()
    expect(s.modelFormat).toBeNull()
    expect(s.isConverting).toBe(false)
    expect(s.glbPartInfos).toEqual([])
    expect(s.folderFiles).toEqual([])
    expect(s.selectedFileIndex).toBe(-1)
    expect(s.fileSortMode).toBe('name')
  })

  it('setGLBUrl stores url', () => {
    useModelStore.getState().setGLBUrl('blob:test')
    expect(useModelStore.getState().glbUrl).toBe('blob:test')
  })

  it('setIsConverting', () => {
    useModelStore.getState().setIsConverting(true)
    expect(useModelStore.getState().isConverting).toBe(true)
    useModelStore.getState().setIsConverting(false)
    expect(useModelStore.getState().isConverting).toBe(false)
  })

  it('setModelBuffer slices the buffer', () => {
    const buf = new ArrayBuffer(100)
    useModelStore.getState().setModelBuffer(buf, 'stl')
    const state = useModelStore.getState()
    expect(state.modelBuffer).not.toBeNull()
    expect(state.modelBuffer!.byteLength).toBe(100)
    expect(state.modelFormat).toBe('stl')
    // Should be a copy, not the same reference
    expect(state.modelBuffer).not.toBe(buf)
  })

  it('setFolderFiles', () => {
    const files = [
      { name: 'a.stl', path: '/tmp/a.stl', mtimeMs: 1000 },
      { name: 'b.stl', path: '/tmp/b.stl', mtimeMs: 2000 },
    ]
    useModelStore.getState().setFolderFiles('/tmp', files)
    const s = useModelStore.getState()
    expect(s.currentFolderPath).toBe('/tmp')
    expect(s.folderFiles).toEqual(files)
    expect(s.selectedFileIndex).toBe(-1)
  })

  it('setSelectedFileIndex', () => {
    useModelStore.getState().setSelectedFileIndex(3)
    expect(useModelStore.getState().selectedFileIndex).toBe(3)
  })

  it('setFileSortMode', () => {
    useModelStore.getState().setFileSortMode('type+name')
    expect(useModelStore.getState().fileSortMode).toBe('type+name')
  })

  it('updateSceneTree and toggleNodeExpanded', () => {
    const tree = makeTree()
    useModelStore.getState().updateSceneTree(tree)
    expect(useModelStore.getState().sceneTree).toEqual(tree)

    useModelStore.getState().toggleNodeExpanded('child1')
    const updated = useModelStore.getState().sceneTree
    expect(updated[0].children![0].expanded).toBe(true)
  })

  it('toggleNodeVisible', () => {
    useModelStore.getState().updateSceneTree(makeTree())
    useModelStore.getState().toggleNodeVisible('root')
    expect(useModelStore.getState().sceneTree[0].visible).toBe(false)
  })

  it('child can be independently toggled visible even when parent is hidden', () => {
    useModelStore.getState().updateSceneTree(makeTree())
    // 1. Toggle root off → all descendants become invisible
    useModelStore.getState().toggleNodeVisible('root')
    let tree = useModelStore.getState().sceneTree
    expect(tree[0].visible).toBe(false)
    expect(tree[0].children![0].visible).toBe(false)
    // 2. Toggle child1 on — this child should be visible despite parent hidden
    useModelStore.getState().toggleNodeVisible('child1')
    tree = useModelStore.getState().sceneTree
    expect(tree[0].children![0].visible).toBe(true)
    // Parent remains hidden
    expect(tree[0].visible).toBe(false)
  })

  it('parent toggle cascades to all children but individual child keeps its own state', () => {
    useModelStore.getState().updateSceneTree(makeTree())
    // Turn off parent
    useModelStore.getState().toggleNodeVisible('root')
    // Turn on one child
    useModelStore.getState().toggleNodeVisible('child1')
    // Turn parent back on
    useModelStore.getState().toggleNodeVisible('root')
    const tree = useModelStore.getState().sceneTree
    expect(tree[0].visible).toBe(true)
    expect(tree[0].children![0].visible).toBe(true)
    expect(tree[0].children![1].visible).toBe(true)
  })

  it('setGlbPartInfos', () => {
    const infos = [
      { partId: 'o0', meshIndex: 0, name: 'Part0', triangleCount: 100 },
    ]
    useModelStore.getState().setGlbPartInfos(infos)
    expect(useModelStore.getState().glbPartInfos).toEqual(infos)
  })

  it('setModelCenteringOffset', () => {
    useModelStore.getState().setModelCenteringOffset([1, 2, 3])
    expect(useModelStore.getState().modelCenteringOffset).toEqual([1, 2, 3])
    useModelStore.getState().setModelCenteringOffset(null)
    expect(useModelStore.getState().modelCenteringOffset).toBeNull()
  })

  it('setModelVersion', () => {
    useModelStore.getState().setModelVersion(5)
    expect(useModelStore.getState().modelVersion).toBe(5)
  })

  it('reset clears all state', () => {
    useModelStore.getState().setGLBUrl('blob:test')
    useModelStore.getState().updateSceneTree(makeTree())
    useModelStore.getState().setModelBuffer(new ArrayBuffer(10), 'stl')
    useModelStore.getState().setIsConverting(true)
    useModelStore.getState().setGlbPartInfos([{ partId: 'x', meshIndex: 0, name: 'X', triangleCount: 1 }])
    useModelStore.getState().setFolderFiles('/tmp', [{ name: 'a.stl', path: '/tmp/a.stl', mtimeMs: 1 }])
    useModelStore.getState().setSelectedFileIndex(0)
    useModelStore.getState().setFileSortMode('type+name')

    useModelStore.getState().reset()

    const s = useModelStore.getState()
    expect(s.glbUrl).toBeNull()
    expect(s.sceneTree).toEqual([])
    expect(s.modelVersion).toBe(0)
    expect(s.modelBuffer).toBeNull()
    expect(s.modelFormat).toBeNull()
    expect(s.isConverting).toBe(false)
    expect(s.glbPartInfos).toEqual([])
    // reset preserves folderFiles & selectedFileIndex (file list persists across model changes)
    expect(s.fileSortMode).toBe('name')
  })
})
