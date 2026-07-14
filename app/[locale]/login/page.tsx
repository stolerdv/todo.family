'use client'

import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'
import { Link, useRouter } from '@/i18n/navigation'

function LoginForm() {
  const tr = useTranslations('auth.login')
  const trErr = useTranslations('auth.errors')
  const trCommon = useTranslations('common')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/app'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const username = usernameRef.current?.value?.trim() ?? ''
    const password = passwordRef.current?.value ?? ''
    if (!username || !password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        router.push(next)
      } else {
        const data = await res.json()
        setError(data.error ?? trErr('login'))
        setLoading(false)
      }
    } catch {
      setError(trErr('connection'))
      setLoading(false)
    }
  }

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-black overflow-hidden px-5">
      <div aria-hidden className="absolute -top-40 w-[560px] h-[560px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(255,122,26,.16), transparent 70%)' }} />
      <form onSubmit={handleSubmit}
        className="relative w-full max-w-sm flex flex-col gap-4 rounded-3xl p-8 border border-white/[0.08]"
        style={{ background: 'linear-gradient(160deg, #141416, #0a0a0b)', boxShadow: '0 30px 80px -20px rgba(0,0,0,.8)' }}>
        <div className="text-center mb-2">
          <img src="/icon-192.png" alt="Pen" className="w-14 h-14 mx-auto mb-3 rounded-[16px]" style={{ boxShadow: '0 8px 24px -8px rgba(255,122,26,.5)' }} />
          <h1 className="text-3xl font-bold tracking-[0.35em] pl-[0.35em] text-white">Pen</h1>
          <p className="text-[11px] text-[#ff7a1a]/80 tracking-[0.25em] uppercase mt-1.5">{trCommon('tagline')}</p>
        </div>
        <input
          ref={usernameRef}
          type="text"
          placeholder={tr('usernamePlaceholder')}
          autoFocus
          autoComplete="username"
          className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-[#ff7a1a] focus:bg-white/[0.06]"
        />
        <input
          ref={passwordRef}
          type="password"
          placeholder={tr('passwordPlaceholder')}
          autoComplete="current-password"
          className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-[#ff7a1a] focus:bg-white/[0.06]"
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl py-3 text-sm font-bold text-[#120a00] transition active:scale-[.98] disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #ffa04d, #ff7a1a)', boxShadow: '0 10px 30px -8px rgba(255,122,26,.55)' }}
        >
          {loading ? tr('submitting') : tr('submit')}
        </button>
        <p className="text-center text-sm text-gray-500">
          {tr('noAccount')}{' '}
          <Link href="/register" className="text-[#ff7a1a] hover:text-[#ffa04d] transition font-medium">
            {tr('registerLink')}
          </Link>
        </p>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
