import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value) } catch { }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key) } catch { }
  },
}

interface UIStore {
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  mobileDrawerOpen: boolean
  mobileChatOpen: boolean
  language: 'zh' | 'en'
  theme: 'light' | 'dark' | 'system'

  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setMobileDrawerOpen: (open: boolean) => void
  setMobileChatOpen: (open: boolean) => void
  setLanguage: (lang: 'zh' | 'en') => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      leftPanelOpen: true,
      rightPanelOpen: true,
      mobileDrawerOpen: false,
      mobileChatOpen: false,
      language: (safeLocalStorage.getItem('lang') as 'zh' | 'en') || 'zh',
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
      name: 'ficad-ui',
      partialize: (s) => ({ language: s.language, theme: s.theme }),
      storage: {
        getItem: safeLocalStorage.getItem,
        setItem: safeLocalStorage.setItem,
        removeItem: safeLocalStorage.removeItem,
      },
    }
  )
)
