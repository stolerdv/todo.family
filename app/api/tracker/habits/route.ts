import { NextRequest, NextResponse } from 'next/server'
import { getHabits, createHabit } from '@/lib/tracker'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET() {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json([])
    const habits = await getHabits(user.userId)
    return NextResponse.json(habits)
  } catch (e) {
    console.error('GET /api/tracker/habits error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const body = await req.json()
    if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const habit = await createHabit(user.userId, {
      name: body.name.trim(),
      description: body.description ?? '',
      emoji: body.emoji,
      color: body.color,
      schedule: body.schedule,
      startDate: body.startDate,
      targetPerDay: body.targetPerDay,
    })
    return NextResponse.json(habit, { status: 201 })
  } catch (e) {
    console.error('POST /api/tracker/habits error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
