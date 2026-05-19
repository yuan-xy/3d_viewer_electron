import { useTopologyPicking } from '@/engine/hooks/useTopologyPicking'
import type { SelectionMode } from '@/stores/tool-store'
import type { SnapCandidate } from '@/lib/topology/snap'
import type { SelectorRuntime } from '@/lib/topology/types'
import type { RefObject } from 'react'
import type * as THREE from 'three'

interface TopologyPickerProps {
  enabled: boolean
  selectionMode: SelectionMode
  selectorRuntime: SelectorRuntime | null
  modelGroupRef: RefObject<THREE.Group | null>
  onHover: (referenceId: string | null) => void
  onClick: (referenceId: string | null, shiftKey?: boolean) => void
  onClickWorldPoint?: (point: THREE.Vector3 | null) => void
  onSnap?: (candidate: SnapCandidate | null) => void
}

/**
 * Canvas-internal wrapper for useTopologyPicking.
 * Must be rendered inside the R3F Canvas because the hook uses useThree().
 */
export default function TopologyPicker({
  enabled,
  selectionMode,
  selectorRuntime,
  modelGroupRef,
  onHover,
  onClick,
  onClickWorldPoint,
  onSnap,
}: TopologyPickerProps) {
  useTopologyPicking({
    enabled,
    selectionMode,
    selectorRuntime,
    modelGroupRef,
    onHover,
    onClick,
    onClickWorldPoint,
    onSnap,
  })
  return null
}
