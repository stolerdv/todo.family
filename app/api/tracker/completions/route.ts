import { NextRequest, NextResponse } from 'next/server'
import { setCount, setCompletion } from '@/lib/tracker'
import { getUserFromRequest } from '@/lib/getUser'

// PUT { habitId, day: 'YYYY-MM-DD', count?: number, done?: boolean }
// count — сколько раз выполнено за день (для привычек несколько раз в день);
// done — обратная совместимость для привычек «1 раз в день».
export async function PUT(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { habitId, day, count, done } = await req.json()
    if (!habitId || !day) return NextResponse.json({ error: 'habitId and day required' }, { status: 400 })
    if (typeof count === 'number') {
      const r = await setCount(habitId, user.userId, day, count)
      return NextResponse.json(r)
    }
    const now = await setCompletion(habitId, user.userId, day, !!done)
    return NextResponse.json({ done: now })
  } catch (e) {
    console.error('PUT /api/tracker/completions error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
