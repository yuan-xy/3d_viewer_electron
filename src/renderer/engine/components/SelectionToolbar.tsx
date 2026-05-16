import { useEffect } from 'react'
import { Box, Square, Minus, Crosshair } from 'lucide-react'
import { useToolStore, type SelectionMode } from '@/stores/tool-store'
import { useModelStore } from '@/stores/model-store'

const MODES: { mode: SelectionMode; label: string; icon: typeof Box }[] = [
  { mode: 'object', label: 'Object', icon: Box },
  { mode: 'face', label: 'Face', icon: Square },
  { mode: 'edge', label: 'Edge', icon: Minus },
  { mode: 'point', label: 'Point', icon: Crosshair },
]

interface SelectionToolbarProps {
  /** Whether topology data is available (face/edge/vertex modes need it) */
  hasTopology: boolean
}

/**
 * Toolbar for switching between object/face/edge/vertex selection sub-modes.
 *
 * Dynamic default:
 * - If model has ≥2 parts → default to 'object'
 * - If single part and topology is present → default to 'face'
 * - Otherwise → 'object' only
 */
export default function SelectionToolbar({ hasTopology }: SelectionToolbarProps) {
  const selectionMode = useToolStore((s) => s.selectionMode)
  const setSelectionMode = useToolStore((s) => s.setSelectionMode)
  const partCount = useModelStore((s) => s.glbPartInfos.length)

  // Set dynamic default when part count or topology status changes
  useEffect(() => {
    if (partCount >= 2) {
      setSelectionMode('object')
    } else if (hasTopology) {
      setSelectionMode('face')
    } else {
      setSelectionMode('object')
    }
  }, [partCount, hasTopology, setSelectionMode])

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: '4px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {MODES.map(({ mode, label, icon: Icon }) => {
        const isActive = selectionMode === mode
        const isDisabled = mode !== 'object' && !hasTopology

        return (
          <button
            key={mode}
            disabled={isDisabled}
            title={label}
            onClick={() => setSelectionMode(mode)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              background: isActive ? '#2563eb' : 'transparent',
              color: isDisabled ? '#555' : isActive ? '#fff' : '#aaa',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
