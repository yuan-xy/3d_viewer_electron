import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from '../locales/zh.json'
import en from '../locales/en.json'

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
  },
}

i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: safeLocalStorage.getItem('lang') || navigator.language.slice(0, 2) || 'zh',
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
})

export default i18n
