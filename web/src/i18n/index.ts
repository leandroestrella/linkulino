import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import it from './locales/it.json'
import es from './locales/es.json'

/** The languages the UI ships in, with the flag shown in the switcher. */
export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

const STORAGE_KEY = 'linkulino.lang'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      it: { translation: it },
      es: { translation: es },
    },
    fallbackLng: 'en',
    supportedLngs: LANGUAGES.map((l) => l.code),
    // Match only the base language (so "it-IT" resolves to "it").
    load: 'languageOnly',
    detection: {
      // `?lng=es` wins (shareable links), then the saved choice, then the browser.
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupQuerystring: 'lng',
      lookupLocalStorage: STORAGE_KEY,
    },
    interpolation: { escapeValue: false },
  })

export default i18n
