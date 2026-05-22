'use client'

import { useState, useEffect } from 'react'

export default function SplashScreen() {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit' | 'done'>('enter')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 100)
    const t2 = setTimeout(() => setPhase('exit'), 2400)
    const t3 = setTimeout(() => setPhase('done'), 3000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  if (phase === 'done') return null

  return (
    <div
      style={{ transition: 'opacity 0.6s ease' }}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gray-950 ${
        phase === 'enter' ? 'opacity-0' : phase === 'exit' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Photo */}
      <div
        style={{ transition: 'transform 0.8s ease, opacity 0.8s ease' }}
        className={`${phase === 'visible' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      >
        <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-white/10 shadow-2xl mb-6">
          <img
            src="/couple.jpg"
            alt=""
            className="w-full h-full object-cover object-top"
          />
        </div>
      </div>

      {/* Text */}
      <div
        style={{ transition: 'transform 0.8s ease 0.2s, opacity 0.8s ease 0.2s' }}
        className={`flex flex-col items-center gap-1.5 ${phase === 'visible' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      >
        <h1 className="text-3xl font-bold tracking-widest text-white">Todo Family</h1>
        <p className="text-sm text-gray-500 tracking-[0.2em] uppercase">Список дел</p>
      </div>

      {/* Subtle loading dots */}
      <div
        style={{ transition: 'opacity 0.8s ease 0.5s' }}
        className={`flex gap-1.5 mt-10 ${phase === 'visible' ? 'opacity-100' : 'opacity-0'}`}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-gray-600 animate-pulse"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  )
}
