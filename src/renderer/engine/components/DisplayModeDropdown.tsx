import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/components/settings/useThemeColors'

export type DisplayMode = 'solid' | 'mesh' | 'wireframe' | 'debug'

interface DisplayModeDropdownProps {
  displayMode: DisplayMode
  onChange: (mode: DisplayMode) => void
  hasTopology: boolean
  hasEdges: boolean
}

export default function DisplayModeDropdown({ displayMode, onChange, hasTopology: _hasTopology, hasEdges }: DisplayModeDropdownProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderRadius: 8,
        background: colors.toolbarBg,
        backdropFilter: 'blur(8px)',
      }}
    >
      <select
        value={displayMode}
        onChange={(e) => onChange(e.target.value as DisplayMode)}
        style={{
          background: 'transparent',
          color: colors.textInactive,
          border: 'none',
          fontSize: 12,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="solid">{t('display.solid')}</option>
        {hasEdges && <option value="wireframe">{t('display.wireframe')}</option>}
        {hasEdges && <option value="solidWithWireframe">{t('display.solidWithWireframe')}</option>}
        <option value="mesh">{t('display.mesh')}</option>
        {hasEdges && <option value="debug">{t('display.debug')}</option>}
      </select>
    </div>
  )
}
