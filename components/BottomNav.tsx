'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  {
    href: '/today', label: 'Сегодня',
    icon: (<><circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" /></>),
  },
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
  const activeIndex = TABS.findIndex(t => pathname === t.href || pathname.startsWith(t.href + '/'))
  return (
    <nav
      className="relative shrink-0 flex items-stretch border-t border-white/[0.07] bg-black/80 backdrop-blur-2xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* скользящий янтарный индикатор активной вкладки */}
      {activeIndex >= 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 h-[2.5px] rounded-full transition-transform duration-500"
          style={{
            width: `${100 / TABS.length}%`,
            transform: `translateX(${activeIndex * 100}%)`,
            transitionTimingFunction: 'cubic-bezier(.34,1.56,.64,1)',
            background: 'linear-gradient(90deg, transparent, #ff7a1a, transparent)',
            boxShadow: '0 0 16px 1px rgba(255,122,26,.6)',
          }}
        />
      )}
      {TABS.map((t, i) => {
        const active = i === activeIndex
        return (
          <Link key={t.href} href={t.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-colors duration-300 ${
              active ? 'text-[#ff7a1a]' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round"
              className="transition-transform duration-300"
              style={{ transform: active ? 'translateY(-1px) scale(1.08)' : 'none', filter: active ? 'drop-shadow(0 3px 8px rgba(255,122,26,.5))' : 'none' }}>
              {t.icon}
            </svg>
            <span>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
