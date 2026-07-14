'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'

export default function JoinPage({ params }: { params: { code: string } }) {
  const tr = useTranslations('auth.join')
  const trErr = useTranslations('auth.errors')
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'confirm' | 'joining' | 'done' | 'error' | 'auth'>('loading')
  const [sectionName, setSectionName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/join/${params.code}`)
      .then(r => {
        if (r.status === 401) { setState('auth'); return null }
        if (!r.ok) { setState('error'); setError(trErr('linkInvalid')); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        setSectionName(data.name)
        setState('confirm')
      })
      .catch(() => setState('error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError(data.error ?? tr('genericError'))
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm flex flex-col items-center gap-5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent-600/20 flex items-center justify-center text-2xl">👥</div>

        {state === 'loading' && <p className="text-gray-400">{tr('loading')}</p>}

        {state === 'auth' && (
          <>
            <h1 className="text-xl font-bold">{tr('authTitle')}</h1>
            <p className="text-gray-500 text-sm">{tr('authSubtitle')}</p>
            <button onClick={() => router.push(`/login?next=/join/${params.code}`)}
              className="w-full bg-accent-600 hover:bg-accent-500 text-[#120a00] font-semibold rounded-xl py-3 text-sm font-medium transition">
              {tr('goLogin')}
            </button>
            <button onClick={() => router.push(`/register?next=/join/${params.code}`)}
              className="w-full bg-gray-800 hover:bg-gray-700 rounded-xl py-3 text-sm transition">
              {tr('goRegister')}
            </button>
          </>
        )}

        {state === 'confirm' && (
          <>
            <h1 className="text-xl font-bold">{tr('confirmTitle')}</h1>
            <p className="text-gray-300">
              {tr('confirmBody', { name: sectionName })}
            </p>
            <button onClick={join}
              className="w-full bg-accent-600 hover:bg-accent-500 text-[#120a00] font-semibold rounded-xl py-3 text-sm font-medium transition">
              {tr('accept')}
            </button>
            <button onClick={() => router.push('/app')}
              className="text-gray-600 hover:text-gray-400 text-sm transition">
              {tr('cancel')}
            </button>
          </>
        )}

        {state === 'joining' && <p className="text-gray-400">{tr('joining')}</p>}

        {state === 'done' && (
          <>
            <div className="text-4xl">✓</div>
            <p className="text-green-400 font-medium">{tr('done', { name: sectionName })}</p>
            <p className="text-gray-600 text-sm">{tr('redirecting')}</p>
          </>
        )}

        {state === 'error' && (
          <>
            <p className="text-red-400">{error || tr('genericError')}</p>
            <button onClick={() => router.push('/app')}
              className="text-gray-500 hover:text-gray-300 text-sm transition">
              {tr('goHome')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
