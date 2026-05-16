import type { Reference } from '@/lib/topology/types'

interface SelectionInfoOverlayProps {
  reference: Reference | null
}

function pointTypeLabel(ref: Reference): string | null {
  if (ref.selectorType !== 'vertex') return null
  const pt = ref.pickData?.pointType
  if (pt === 'edge-mid') return 'Edge Midpoint'
  if (pt === 'face-center') return 'Face Center'
  if (pt === 'vertex') return 'Vertex'
  return null
}

/**
 * HUD overlay showing the selected element's label, type, and properties.
 * Positioned in the top-left corner of the viewport.
 */
export default function SelectionInfoOverlay({ reference }: SelectionInfoOverlayProps) {
  if (!reference) return null

  const pointLabel = pointTypeLabel(reference)
  const pd = reference.pickData

  type FieldRow = [string, unknown]

  let fields: FieldRow[] = []
  if (reference.selectorType === 'face') {
    fields = [
      ['id', reference.normalizedSelector || reference.id],
      ['type', pd.surfaceType ?? '-'],
      ['area', pd.area != null ? pd.area.toFixed(4) : '-'],
      ['edgeCount', pd.edgeCount ?? '-'],
    ]
  } else if (reference.selectorType === 'edge') {
    fields = [
      ['id', reference.normalizedSelector || reference.id],
      ['type', pd.curveType ?? '-'],
      ['length', pd.length != null ? pd.length.toFixed(4) : '-'],
      ['segCount', pd.segmentCount ?? '-'],
    ]
  } else if (reference.selectorType === 'vertex') {
    const center = pd.center
    const coords = center && center.length === 3
      ? `(${center[0].toFixed(3)}, ${center[1].toFixed(3)}, ${center[2].toFixed(3)})`
      : null
    if (coords) fields.push(['pos', coords])
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)',
        color: '#fff',
        fontSize: 12,
        fontFamily: 'monospace',
        lineHeight: 1.6,
        zIndex: 10,
        pointerEvents: 'none',
        userSelect: 'none',
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#f59e0b' }}>
        {pointLabel && <span>[{pointLabel}] </span>}
        {reference.selectorType.toUpperCase()}
      </div>
      {fields.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: '#888' }}>{label}</span>
          <span>{String(value)}</span>
        </div>
      ))}
    </div>
  )
}
