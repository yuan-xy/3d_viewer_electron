import type { SceneTreeNode } from '@/stores/model-store'

export function flattenVisibility(tree: SceneTreeNode[]): Map<string, boolean> {
  const map = new Map<string, boolean>()
  for (const node of tree) {
    map.set(node.id, node.visible)
    if (node.children) {
      for (const [childId, childVis] of flattenVisibility(node.children)) {
        map.set(childId, childVis)
      }
    }
  }
  return map
}
