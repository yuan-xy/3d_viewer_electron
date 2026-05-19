import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from '../locales/zh.json'
import en from '../locales/en.json'
import es from '../locales/es.json'
import ja from '../locales/ja.json'
import ko from '../locales/ko.json'
import fr from '../locales/fr.json'
import de from '../locales/de.json'
import pt from '../locales/pt.json'
import ru from '../locales/ru.json'
import ar from '../locales/ar.json'
import hi from '../locales/hi.json'
import id from '../locales/id.json'
import tr from '../locales/tr.json'
import it from '../locales/it.json'
import nl from '../locales/nl.json'
import pl from '../locales/pl.json'
import vi from '../locales/vi.json'
import th from '../locales/th.json'
import uk from '../locales/uk.json'
import sv from '../locales/sv.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'zh', name: '中文' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'th', name: 'ไทย' },
  { code: 'uk', name: 'Українська' },
  { code: 'sv', name: 'Svenska' },
] as const

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['code']

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
  },
}

const resources = {
  zh: { translation: zh },
  en: { translation: en },
  es: { translation: es },
  ja: { translation: ja },
  ko: { translation: ko },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  ru: { translation: ru },
  ar: { translation: ar },
  hi: { translation: hi },
  id: { translation: id },
  tr: { translation: tr },
  it: { translation: it },
  nl: { translation: nl },
  pl: { translation: pl },
  vi: { translation: vi },
  th: { translation: th },
  uk: { translation: uk },
  sv: { translation: sv },
}

const getInitialLanguage = (): string => {
  const saved = safeLocalStorage.getItem('lang')
  if (saved && Object.keys(resources).includes(saved)) {
    return saved
  }
  const browserLang = navigator.language.slice(0, 2)
  return Object.keys(resources).includes(browserLang) ? browserLang : 'zh'
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
})

export default i18n
