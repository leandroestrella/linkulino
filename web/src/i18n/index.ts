import { createI18n, LANGUAGES, type LanguageCode } from '@lndrstrll/pomuku-i18n'
import en from './locales/en.json'
import it from './locales/it.json'
import es from './locales/es.json'

/**
 * The UI's translations: i18next, set up by pomuku in English, Italiano and
 * Español. The language is, in order: `?lng=` in the address (shareable links),
 * the choice saved on this device, the browser's own. Linkulino's strings are
 * laid over the ones every pomuku app shares (loading, sign-in, try again), so
 * giving the same key here rewords a shared string.
 */
export const i18n = createI18n({ app: 'linkulino', resources: { en, it, es } })

export { LANGUAGES }
export type { LanguageCode }
export default i18n
