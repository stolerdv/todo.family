import type { Locale } from '@/i18n/routing'

// Наш короткий код языка (ru/en/sk) → BCP-47 тег для Intl.NumberFormat/toLocaleDateString.
const MAP: Record<Locale, string> = { ru: 'ru-RU', en: 'en-US', sk: 'sk-SK' }

export function toIntlLocale(locale: Locale): string {
  return MAP[locale]
}
