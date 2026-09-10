import { watch } from 'vue'
import { createI18n } from 'vue-i18n'

const messages = Object.fromEntries(
  Object.entries(

    import.meta.glob<{ default: any }>('./locales/*.json', { eager: true }))
    .map(([key, value]) => [key.slice(10, -5), value.default]),
)

const supportedLocales = ['en', 'ru', 'uz'] as const
type SupportedLocale = typeof supportedLocales[number]

function normalizeLocale(value: string | null): SupportedLocale {
  return supportedLocales.includes(value as SupportedLocale) ? value as SupportedLocale : 'uz'
}

const savedLocale = normalizeLocale(typeof window === 'undefined' ? null : localStorage.getItem('appLocale'))

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en',
  messages,
})

watch(
  () => i18n.global.locale.value,
  locale => {
    const normalized = normalizeLocale(String(locale))
    if (typeof document !== 'undefined')
      document.documentElement.lang = normalized
    if (typeof window !== 'undefined')
      localStorage.setItem('appLocale', normalized)
  },
  { immediate: true },
)

export default i18n
