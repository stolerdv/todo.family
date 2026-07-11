import { NextRequest, NextResponse } from 'next/server'
import { setCompletion } from '@/lib/tracker'
import { getUserFromRequest } from '@/lib/getUser'

// PUT { habitId, day: 'YYYY-MM-DD', done: boolean } — поставить/снять отметку
export async function PUT(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { habitId, day, done } = await req.json()
    if (!habitId || !day) return NextResponse.json({ error: 'habitId and day required' }, { status: 400 })
    const now = await setCompletion(habitId, user.userId, day, !!done)
    return NextResponse.json({ done: now })
  } catch (e) {
    console.error('PUT /api/tracker/completions error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
