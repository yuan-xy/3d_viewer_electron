import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SupportedLanguage } from '@/i18n'

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key) } catch (e) { console.error('localStorage getItem error:', e); return null }
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value) } catch (e) { console.error('localStorage setItem error:', e) }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key) } catch (e) { console.error('localStorage removeItem error:', e) }
  },
}

export type CameraMode = 'perspective' | 'orthographic'

interface UIStore {
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  modelInfoOpen: boolean
  mobileDrawerOpen: boolean
  mobileChatOpen: boolean
  language: SupportedLanguage | 'system'
  theme: 'light' | 'dark' | 'system'
  cameraMode: CameraMode
  enablePreview: boolean

  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  toggleModelInfo: () => void
  setMobileDrawerOpen: (open: boolean) => void
  setMobileChatOpen: (open: boolean) => void
  setLanguage: (lang: SupportedLanguage | 'system') => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setCameraMode: (mode: CameraMode) => void
  setEnablePreview: (v: boolean) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      leftPanelOpen: true,
      rightPanelOpen: true,
      modelInfoOpen: false,
      mobileDrawerOpen: false,
      mobileChatOpen: false,
      language: (safeLocalStorage.getItem('lang') as SupportedLanguage | 'system') || 'zh',
      theme: 'system',
      cameraMode: 'perspective',
      enablePreview: false,

      toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      toggleModelInfo: () => set((s) => ({ modelInfoOpen: !s.modelInfoOpen })),
      setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
      setMobileChatOpen: (open) => set({ mobileChatOpen: open }),
      setLanguage: (language) => {
        safeLocalStorage.setItem('lang', language)
        set({ language })
      },
      setTheme: (theme) => set({ theme }),
      setCameraMode: (cameraMode) => set({ cameraMode }),
      setEnablePreview: (enablePreview) => set({ enablePreview }),
    }),
    {
      name: 'faicad-ui',
      partialize: (s) => ({ language: s.language, theme: s.theme, enablePreview: s.enablePreview }),
      storage: {
        getItem: safeLocalStorage.getItem,
        setItem: safeLocalStorage.setItem,
        removeItem: safeLocalStorage.removeItem,
      },
    }
  )
)
