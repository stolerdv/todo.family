'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
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
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        router.push('/app')
      } else {
        const data = await res.json()
        setError(data.error ?? 'Ошибка входа')
        setLoading(false)
      }
    } catch {
      setError('Ошибка соединения')
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-center">Todo</h1>
        <input
          ref={usernameRef}
          type="text"
          placeholder="Логин"
          autoFocus
          autoComplete="username"
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition"
        />
        <input
          ref={passwordRef}
          type="password"
          placeholder="Пароль"
          autoComplete="current-password"
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition"
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg py-2.5 text-sm font-medium transition"
        >
          {loading ? 'Вход...' : 'Войти'}
        </button>
        <p className="text-center text-sm text-gray-500">
          Нет аккаунта?{' '}
          <Link href="/register" className="text-indigo-400 hover:text-indigo-300 transition">
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </div>
  )
}
