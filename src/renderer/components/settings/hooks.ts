import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'
import i18n, { SUPPORTED_LANGUAGES } from '@/i18n'

function resolveTheme(theme: 'light' | 'dark' | 'system'): boolean {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return theme === 'dark'
}

export function useThemeSync() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    const isDark = resolveTheme(theme)
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const root = document.documentElement
      if (e.matches) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])
}

export function useLanguageSync() {
  const language = useUIStore((s) => s.language)

  useEffect(() => {
    const targetLang = language === 'system'
      ? navigator.language.slice(0, 2)
      : language

    const supportedCodes = SUPPORTED_LANGUAGES.map(l => l.code)
    const lang = supportedCodes.includes(targetLang as typeof supportedCodes[number]) ? targetLang : 'zh'
    i18n.changeLanguage(lang)
  }, [language])
}