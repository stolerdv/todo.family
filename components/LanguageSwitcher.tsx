'use client'

import { useLocale } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'

const LABELS: Record<Locale, string> = { ru: 'RU', en: 'EN', sk: 'SK' }

// Переключатель языка — один на всё приложение (см. app/[locale]/(main)/layout.tsx).
// Link с явным locale от next-intl сам подставляет нужный префикс и остаётся
// на той же странице (usePathname() тут locale-agnostic, т.е. без префикса).
export default function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  return (
    <div
      className="fixed z-40 flex items-center gap-0.5 rounded-full border border-white/10 bg-black/60 backdrop-blur-xl p-0.5"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)', right: 12 }}
    >
      {routing.locales.map(l => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wide transition ${
            l === locale ? 'bg-[#ff7a1a] text-[#120a00]' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {LABELS[l]}
        </Link>
      ))}
    </div>
  )
}
