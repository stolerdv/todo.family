'use client'

import { useEffect, useRef, useState } from 'react'

type Status = 'idle' | 'listening' | 'thinking' | 'result' | 'error'

// Голосовой помощник: одна кнопка на всё приложение — надиктовал команду, она
// сама разобралась через Claude (расход/доход/перевод/событие/задача) и выполнилась.
// Кабинет для финансовых команд берётся из localStorage (последний открытый) или
// резолвится на сервере по умолчанию — так кнопка работает с любого экрана.
export default function VoiceAssistant() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [heard, setHeard] = useState('')
  const [message, setMessage] = useState('')
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupported(!!SR)
  }, [])

  function getSpaceId(): string | null {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('fin_space') : null
  }

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setSupported(false); return }
    setOpen(true)
    setStatus('listening')
    setHeard('')
    setMessage('')

    const recognition = new SR()
    recognition.lang = 'ru-RU'
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join(' ')
      setHeard(transcript)
    }
    recognition.onerror = () => {
      setStatus('error')
      setMessage('Не расслышал. Попробуйте ещё раз.')
    }
    recognition.onend = () => {
      setHeard(current => {
        if (current.trim()) submit(current.trim())
        else { setStatus('error'); setMessage('Не расслышал. Попробуйте ещё раз.') }
        return current
      })
    }
    recognition.start()
  }

  async function submit(text: string) {
    setStatus('thinking')
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, spaceId: getSpaceId() }),
      })
      const data = await res.json()
      setMessage(data.message || 'Готово')
      setStatus(res.ok ? 'result' : 'error')
    } catch {
      setStatus('error')
      setMessage('Не получилось связаться с сервером.')
    }
  }

  function close() {
    recognitionRef.current?.stop?.()
    setOpen(false)
    setStatus('idle')
  }

  if (!open) {
    return (
      <button
        onClick={startListening}
        aria-label="Голосовой помощник"
        className="fixed z-40 grid place-items-center rounded-full shadow-lg"
        style={{
          right: 20, bottom: 'calc(84px + env(safe-area-inset-bottom, 0px) + 72px)',
          width: 52, height: 52,
          background: 'linear-gradient(135deg, #ffa04d, #ff7a1a)',
          boxShadow: '0 10px 30px -8px rgba(255,122,26,.55)',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#120a00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
        </svg>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      <div
        className="relative w-full max-w-[640px] rounded-t-[24px] border-t border-white/10 px-5 pt-3 text-white"
        style={{ background: '#0b0b0d', paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />

        {!supported && (
          <p className="py-6 text-center text-sm text-gray-400">
            Голосовой ввод не поддерживается в этом браузере.
          </p>
        )}

        {supported && status === 'listening' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="grid h-16 w-16 place-items-center rounded-full" style={{ background: 'linear-gradient(135deg, #ffa04d, #ff7a1a)', boxShadow: '0 0 0 8px rgba(255,122,26,.15)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#120a00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            </div>
            <p className="min-h-[24px] text-center text-[15px] text-gray-200">{heard || 'Слушаю…'}</p>
          </div>
        )}

        {status === 'thinking' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15" style={{ borderTopColor: '#ff7a1a' }} />
            <p className="text-sm text-gray-400">«{heard}»</p>
          </div>
        )}

        {(status === 'result' || status === 'error') && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="text-3xl">{status === 'result' ? '✅' : '🤔'}</div>
            <p className="text-[15px] font-semibold">{message}</p>
            <div className="flex w-full gap-2 pt-2">
              <button onClick={close} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] py-3 text-sm font-semibold text-gray-300">
                Готово
              </button>
              <button onClick={startListening} className="flex-1 rounded-2xl py-3 text-sm font-bold" style={{ background: 'linear-gradient(135deg, #ffa04d, #ff7a1a)', color: '#120a00' }}>
                Ещё раз
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
