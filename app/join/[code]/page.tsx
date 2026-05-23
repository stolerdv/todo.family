'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function JoinPage({ params }: { params: { code: string } }) {
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'confirm' | 'joining' | 'done' | 'error' | 'auth'>('loading')
  const [sectionName, setSectionName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/join/${params.code}`)
      .then(r => {
        if (r.status === 401) { setState('auth'); return null }
        if (!r.ok) { setState('error'); setError('Ссылка недействительна'); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        setSectionName(data.name)
        setState('confirm')
      })
      .catch(() => setState('error'))
  }, [params.code])

  async function join() {
    setState('joining')
    const res = await fetch(`/api/join/${params.code}`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setState('done')
      setTimeout(() => router.push('/app'), 1500)
    } else {
      setState('error')
      setError(data.error ?? 'Ошибка')
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm flex flex-col items-center gap-5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 flex items-center justify-center text-2xl">👥</div>

        {state === 'loading' && <p className="text-gray-400">Загрузка...</p>}

        {state === 'auth' && (
          <>
            <h1 className="text-xl font-bold">Войдите чтобы присоединиться</h1>
            <p className="text-gray-500 text-sm">Нужен аккаунт чтобы получить доступ к разделу</p>
            <button onClick={() => router.push(`/login?next=/join/${params.code}`)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-xl py-3 text-sm font-medium transition">
              Войти
            </button>
            <button onClick={() => router.push(`/register?next=/join/${params.code}`)}
              className="w-full bg-gray-800 hover:bg-gray-700 rounded-xl py-3 text-sm transition">
              Зарегистрироваться
            </button>
          </>
        )}

        {state === 'confirm' && (
          <>
            <h1 className="text-xl font-bold">Приглашение в раздел</h1>
            <p className="text-gray-300">
              Вас приглашают в раздел <span className="text-white font-semibold">«{sectionName}»</span>
            </p>
            <button onClick={join}
              className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-xl py-3 text-sm font-medium transition">
              Принять приглашение
            </button>
            <button onClick={() => router.push('/app')}
              className="text-gray-600 hover:text-gray-400 text-sm transition">
              Отменить
            </button>
          </>
        )}

        {state === 'joining' && <p className="text-gray-400">Подключение...</p>}

        {state === 'done' && (
          <>
            <div className="text-4xl">✓</div>
            <p className="text-green-400 font-medium">Вы в разделе «{sectionName}»!</p>
            <p className="text-gray-600 text-sm">Переходим в приложение...</p>
          </>
        )}

        {state === 'error' && (
          <>
            <p className="text-red-400">{error || 'Что-то пошло не так'}</p>
            <button onClick={() => router.push('/app')}
              className="text-gray-500 hover:text-gray-300 text-sm transition">
              На главную
            </button>
          </>
        )}
      </div>
    </div>
  )
}
