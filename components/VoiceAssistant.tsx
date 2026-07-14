'use client'

import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; text: string; ok?: boolean }

// Быстрый чат с ассистентом: пишешь или диктуешь команду (голос вставляет текст
// в поле, ничего не отправляя сам) — правишь при желании — отправляешь. Ответ
// (получилось / не понял / ошибка) приходит отдельным сообщением, как в чате.
// Кабинет для финансовых команд берётся из localStorage (последний открытый).
export default function VoiceAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [sending, setSending] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<any>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupported(!!SR)
  }, [])

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  function getSpaceId(): string | null {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('fin_space') : null
  }

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setSupported(false); return }
    const recognition = new SR()
    recognition.lang = 'ru-RU'
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition
    setListening(true)

    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join(' ')
      setInput(transcript)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognition.start()
  }

  function stopListening() {
    recognitionRef.current?.stop?.()
    setListening(false)
  }

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setMessages(m => [...m, { role: 'user', text }])
    setInput('')
    setSending(true)
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, spaceId: getSpaceId() }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', text: data.message || (res.ok ? 'Готово' : 'Не получилось'), ok: res.ok }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Не получилось связаться с сервером.', ok: false }])
    } finally {
      setSending(false)
    }
  }

  function close() {
    recognitionRef.current?.stop?.()
    setListening(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Быстрый чат с ассистентом"
        className="fixed z-40 grid place-items-center rounded-full shadow-lg"
        style={{
          right: 20, bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
          width: 52, height: 52,
          background: 'linear-gradient(135deg, #ffa04d, #ff7a1a)',
          boxShadow: '0 10px 30px -8px rgba(255,122,26,.55)',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#120a00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      <div
        className="relative w-full max-w-[640px] rounded-t-[24px] border-t border-white/10 text-white flex flex-col"
        style={{ background: '#0b0b0d', maxHeight: '82vh' }}
      >
        <div className="mx-auto mt-3 mb-1 h-1 w-10 rounded-full bg-white/15 shrink-0" />
        <div className="flex items-center justify-between px-5 py-2 shrink-0">
          <h2 className="text-[15px] font-semibold">Быстрый чат</h2>
          <button onClick={close} className="text-gray-500 hover:text-gray-300 text-sm">Закрыть</button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-2 space-y-2.5" style={{ minHeight: 140 }}>
          {messages.length === 0 && (
            <p className="text-center text-[13px] text-gray-500 py-8 leading-relaxed">
              Напишите или продиктуйте команду — например: «расход 1000 тенге с Kaspi на продукты»
              или «20 июля в 10:00 встреча в центре».
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug ${
                m.role === 'user'
                  ? 'font-medium'
                  : m.ok === false ? 'bg-red-500/10 text-red-300 border border-red-500/20' : 'bg-white/[0.06] text-gray-200 border border-white/10'
              }`}
                style={m.role === 'user' ? { background: 'linear-gradient(135deg, #ffa04d, #ff7a1a)', color: '#120a00' } : undefined}
              >
                {m.role === 'assistant' && <span className="mr-1.5">{m.ok === false ? '🤔' : '✅'}</span>}
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-white/[0.06] border border-white/10 flex gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '120ms' }} />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '240ms' }} />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 pt-2 shrink-0" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          {!supported && <p className="text-[11px] text-gray-600 mb-1.5 text-center">Голосовой ввод не поддерживается в этом браузере — можно печатать.</p>}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              aria-label={listening ? 'Остановить запись' : 'Голосовой ввод'}
              disabled={!supported}
              className="shrink-0 grid place-items-center rounded-full transition"
              style={{
                width: 44, height: 44,
                background: listening ? 'linear-gradient(135deg, #ff6a6a, #d63a3a)' : 'linear-gradient(135deg, #ffa04d, #ff7a1a)',
                opacity: supported ? 1 : .35,
                boxShadow: listening ? '0 0 0 6px rgba(255,90,90,.15)' : '0 6px 18px -6px rgba(255,122,26,.6)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#120a00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            </button>
            <textarea
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={listening ? 'Слушаю…' : 'Напишите команду…'}
              rows={1}
              className="flex-1 resize-none bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-2.5 text-[14px] text-white placeholder-gray-500 outline-none focus:border-[#ff7a1a]/50"
              style={{ maxHeight: 96 }}
            />
            <button
              type="button"
              onClick={send}
              disabled={!input.trim() || sending}
              aria-label="Отправить"
              className="shrink-0 grid place-items-center rounded-full transition disabled:opacity-30"
              style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #ffa04d, #ff7a1a)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#120a00" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
