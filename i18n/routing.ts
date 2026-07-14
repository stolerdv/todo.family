import { defineRouting } from 'next-intl/routing'

// ru — дефолтный язык без префикса (существующие адреса /today, /finance и т.д.
// остаются как есть — это важно для уже установленной PWA-иконки на телефоне,
// её start_url кэшируется ОС и не обновляется при изменении). en/sk получают
// префикс (/en/..., /sk/...). localeDetection выключен намеренно: иначе next-intl
// сам определял бы язык по Accept-Language браузера и мог бы на первом же
// холодном запуске увести уже установленную иконку с /today на /en/today.
export const routing = defineRouting({
  locales: ['ru', 'en', 'sk'],
  defaultLocale: 'ru',
  localePrefix: 'as-needed',
  localeDetection: false,
})

export type Locale = (typeof routing.locales)[number]
