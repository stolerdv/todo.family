'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  {
    href: '/tracker', label: 'Трекер',
    icon: (<><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>),
  },
  {
    href: '/finance', label: 'Финансы',
    icon: (<><rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /><circle cx="17" cy="14.5" r="1.2" fill="currentColor" stroke="none" /></>),
  },
  {
    href: '/app', label: 'Напоминания',
    icon: (<><path d="M8 6h12M8 12h12M8 18h12" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>),
  },
]

export default function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="shrink-0 flex items-stretch border-t border-white/10 bg-gray-950/95 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map(t => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/')
        return (
          <Link key={t.href} href={t.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition ${
              active ? 'text-white' : 'text-gray-500'
            }`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
              {t.icon}
            </svg>
            <span>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
