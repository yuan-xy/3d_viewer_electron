import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))

// Mock stores with default state
const { mockSetIsConverting, mockSetModelBuffer, mockSetGLBUrl, mockSetFolderFiles } = vi.hoisted(() => ({
  mockSetIsConverting: vi.fn(),
  mockSetModelBuffer: vi.fn(),
  mockSetGLBUrl: vi.fn(),
  mockSetFolderFiles: vi.fn(),
}))

vi.mock('@/stores/model-store', () => {
  const state = {
    modelBuffer: null,
    modelFormat: null,
    glbUrl: null,
    folderFiles: [],
    sceneTree: [],
    currentFolderPath: null,
    selectedFileIndex: -1,
    setIsConverting: mockSetIsConverting,
    setModelBuffer: mockSetModelBuffer,
    setGLBUrl: mockSetGLBUrl,
    setFolderFiles: mockSetFolderFiles,
    toggleNodeExpanded: vi.fn(),
    toggleNodeVisible: vi.fn(),
  }
  const useModelStore = Object.assign(
    (selector?: (s: typeof state) => any) => (selector ? selector(state) : state),
    { getState: () => state },
  )
  return { useModelStore }
})

vi.mock('@/stores/ui-store', () => {
  const state = {
    leftPanelOpen: false,
    rightPanelOpen: false,
    modelInfoOpen: false,
    cameraMode: 'perspective',
    toggleLeftPanel: vi.fn(),
    toggleRightPanel: vi.fn(),
    toggleModelInfo: vi.fn(),
    setCameraMode: vi.fn(),
  }
  const useUIStore = Object.assign(
    (selector?: (s: typeof state) => any) => (selector ? selector(state) : state),
    { getState: () => state, setState: (partial: Partial<typeof state>) => Object.assign(state, partial) },
  )
  return { useUIStore }
})

vi.mock('@/stores/selection-store', () => ({
  useSelectionStore: () => ({
    selectedReferenceIds: [],
  }),
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('@/lib/step-converter', () => ({
  stepToGlbCached: vi.fn(),
}))

vi.mock('@/components/FileListPanel', () => ({
  default: () => null,
}))

vi.mock('@/components/ModelInfoPanel', () => ({
  default: () => null,
}))

vi.mock('@/stores/engine-store', () => {
  const state = { modelGroup: null }
  const useEngineStore = Object.assign(
    (selector?: (s: typeof state) => any) => (selector ? selector(state) : state),
    { getState: () => state },
  )
  return { useEngineStore }
})

vi.mock('@/components/CacheManager', () => ({
  CacheManager: () => null,
}))

vi.mock('@/components/settings/SettingsDialog', () => ({
  SettingsDialog: () => null,
}))

vi.mock('@/pages/WorkspacePage', () => ({
  default: () => null,
}))

import DesktopLayout from '../DesktopLayout'

describe('DesktopLayout toolbar', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).electronAPI = {
      openFileDialog: vi.fn().mockResolvedValue({ success: true, filePaths: [] }),
      readFile: vi.fn().mockResolvedValue({ success: false, error: 'no file' }),
      readFileAsBase64: vi.fn().mockResolvedValue({ success: false, error: 'no file' }),
      readDirectory: vi.fn().mockResolvedValue({ success: true, files: [] }),
      getFilePath: vi.fn(),
      getAppVersion: vi.fn(),
      openExternal: vi.fn(),
      toggleFullscreen: vi.fn().mockResolvedValue(true),
      onFullscreenChanged: vi.fn().mockReturnValue(() => {}),
    }
  })

  it('renders open file button in the toolbar', () => {
    render(
      <TooltipProvider>
        <MemoryRouter>
          <DesktopLayout />
        </MemoryRouter>
      </TooltipProvider>,
    )

    const button = screen.getByRole('button', { name: 'toolbar.openFile' })
    expect(button).toBeDefined()
  })

  it('calls electronAPI.openFileDialog when clicked', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <MemoryRouter>
          <DesktopLayout />
        </MemoryRouter>
      </TooltipProvider>,
    )

    const buttons = screen.getAllByRole('button', { name: 'toolbar.openFile' })
    await user.click(buttons[0])

    expect(window.electronAPI.openFileDialog).toHaveBeenCalledOnce()
  })

  it('renders fullscreen button in the toolbar', () => {
    render(
      <TooltipProvider>
        <MemoryRouter>
          <DesktopLayout />
        </MemoryRouter>
      </TooltipProvider>,
    )

    const button = screen.getByRole('button', { name: 'toolbar.fullscreen' })
    expect(button).toBeDefined()
  })

  it('calls electronAPI.toggleFullscreen when fullscreen button clicked', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <MemoryRouter>
          <DesktopLayout />
        </MemoryRouter>
      </TooltipProvider>,
    )

    const buttons = screen.getAllByRole('button', { name: 'toolbar.fullscreen' })
    await user.click(buttons[0])

    expect(window.electronAPI.toggleFullscreen).toHaveBeenCalledOnce()
  })

  it('renders perspective and orthographic view buttons', () => {
    render(
      <TooltipProvider>
        <MemoryRouter>
          <DesktopLayout />
        </MemoryRouter>
      </TooltipProvider>,
    )

    expect(screen.getByRole('button', { name: 'toolbar.perspective' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'toolbar.orthographic' })).toBeDefined()
  })

  it('calls setCameraMode when orthographic button clicked', async () => {
    const user = userEvent.setup()
    const { useUIStore } = await import('@/stores/ui-store')

    render(
      <TooltipProvider>
        <MemoryRouter>
          <DesktopLayout />
        </MemoryRouter>
      </TooltipProvider>,
    )

    const button = screen.getByRole('button', { name: 'toolbar.orthographic' })
    await user.click(button)

    expect((useUIStore.getState() as any).setCameraMode).toHaveBeenCalledWith('orthographic')
  })
})
