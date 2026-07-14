'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function SplashScreen() {
  const tr = useTranslations('common')
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit' | 'done'>('enter')
  const [imgLoaded, setImgLoaded] = useState(false)

  useEffect(() => {
    // Preload image first
    const img = new Image()
    img.src = '/icon-512.png'
    img.onload = () => setImgLoaded(true)
    img.onerror = () => setImgLoaded(true) // show anyway even if fails

    const t1 = setTimeout(() => setPhase('visible'), 200)
    const t2 = setTimeout(() => setPhase('exit'), 2600)
    const t3 = setTimeout(() => setPhase('done'), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  if (phase === 'done') return null

  const visible = phase === 'visible'

  return (
    <div
      style={{ transition: 'opacity 0.6s ease' }}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black overflow-hidden ${
        phase === 'exit' ? 'opacity-0' : phase === 'enter' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* амбьентное янтарное свечение */}
      <div
        aria-hidden
        style={{
          background: 'radial-gradient(circle, rgba(255,122,26,.22), transparent 70%)',
          transition: 'opacity 1s ease, transform 1s ease',
          transform: visible ? 'scale(1)' : 'scale(.6)',
        }}
        className={`absolute w-[520px] h-[520px] rounded-full blur-2xl ${visible ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Photo circle */}
      <div
        style={{ transition: 'transform 0.7s ease, opacity 0.7s ease' }}
        className={`relative mb-6 ${visible && imgLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
      >
        <div className="w-28 h-28 rounded-[28px] overflow-hidden border border-white/10 bg-black"
          style={{ boxShadow: '0 20px 60px -15px rgba(255,122,26,.5), 0 0 0 1px rgba(255,255,255,.04)' }}>
          {imgLoaded ? (
            <img
              src="/icon-512.png"
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-800 animate-pulse" />
          )}
        </div>
      </div>

      {/* Text */}
      <div
        style={{ transition: 'transform 0.7s ease 0.15s, opacity 0.7s ease 0.15s' }}
        className={`flex flex-col items-center gap-1.5 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
      >
        <h1 className="relative text-4xl font-bold tracking-[0.3em] text-white pl-[0.3em]">Pen</h1>
        <p className="relative text-xs text-[#ff7a1a]/80 tracking-[0.25em] uppercase">{tr('tagline')}</p>
      </div>

      {/* Dots */}
      <div
        style={{ transition: 'opacity 0.7s ease 0.3s' }}
        className={`relative flex gap-1.5 mt-10 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[#ff7a1a] animate-pulse"
            style={{ animationDelay: `${i * 0.2}s`, boxShadow: '0 0 8px rgba(255,122,26,.8)' }}
          />
        ))}
      </div>
    </div>
  )
}
