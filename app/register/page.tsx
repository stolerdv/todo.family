'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const username = usernameRef.current?.value?.trim() ?? ''
    const password = passwordRef.current?.value ?? ''
    if (!username || !password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        router.push('/app')
      } else {
        const data = await res.json()
        setError(data.error ?? 'Ошибка регистрации')
        setLoading(false)
      }
    } catch {
      setError('Ошибка соединения')
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
        <h1 className="text-xl font-bold text-center text-white mb-1">Создать аккаунт</h1>
        <input
          ref={usernameRef}
          type="text"
          placeholder="Придумай логин"
          autoFocus
          autoComplete="username"
          className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-[#ff7a1a] focus:bg-white/[0.06]"
        />
        <input
          ref={passwordRef}
          type="password"
          placeholder="Пароль (мин. 6 символов)"
          autoComplete="new-password"
          className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-[#ff7a1a] focus:bg-white/[0.06]"
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl py-3 text-sm font-bold text-[#120a00] transition active:scale-[.98] disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #ffa04d, #ff7a1a)', boxShadow: '0 10px 30px -8px rgba(255,122,26,.55)' }}
        >
          {loading ? 'Создаём...' : 'Зарегистрироваться'}
        </button>
        <p className="text-center text-sm text-gray-500">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="text-[#ff7a1a] hover:text-[#ffa04d] transition font-medium">
            Войти
          </Link>
        </p>
      </form>
    </div>
  )
}
