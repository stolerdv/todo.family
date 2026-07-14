import { cookies } from 'next/headers'
import { routing, type Locale } from '@/i18n/routing'

// Определяет текущий язык вне [locale]-роутов (API-хендлеры) — next-intl сам
// туда locale не прокидывает, читаем ту же куку NEXT_LOCALE, которую он
// сам же и выставляет при заходе на страницу.
export function getLocaleFromCookies(): Locale {
  const value = cookies().get('NEXT_LOCALE')?.value
  return (routing.locales as readonly string[]).includes(value ?? '') ? (value as Locale) : routing.defaultLocale
}
