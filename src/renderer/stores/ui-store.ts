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

interface UIStore {
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  mobileDrawerOpen: boolean
  mobileChatOpen: boolean
  language: SupportedLanguage | 'system'
  theme: 'light' | 'dark' | 'system'

  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setMobileDrawerOpen: (open: boolean) => void
  setMobileChatOpen: (open: boolean) => void
  setLanguage: (lang: SupportedLanguage | 'system') => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      leftPanelOpen: true,
      rightPanelOpen: true,
      mobileDrawerOpen: false,
      mobileChatOpen: false,
      language: (safeLocalStorage.getItem('lang') as SupportedLanguage | 'system') || 'zh',
      theme: 'system',

      toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
      setMobileChatOpen: (open) => set({ mobileChatOpen: open }),
      setLanguage: (language) => {
        safeLocalStorage.setItem('lang', language)
        set({ language })
      },
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'faicad-ui',
      partialize: (s) => ({ language: s.language, theme: s.theme }),
      storage: {
        getItem: safeLocalStorage.getItem,
        setItem: safeLocalStorage.setItem,
        removeItem: safeLocalStorage.removeItem,
      },
    }
  )
)
