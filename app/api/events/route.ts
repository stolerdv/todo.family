import { NextRequest, NextResponse } from 'next/server'
import { getEvents, createEvent } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET() {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json([])
    return NextResponse.json(await getEvents(user.userId))
  } catch (e) {
    console.error('GET /api/events error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    if (!b.day || !b.title?.trim()) return NextResponse.json({ error: 'day and title required' }, { status: 400 })
    const ev = await createEvent(user.userId, {
      day: b.day, time: b.time, endTime: b.endTime, title: b.title.trim(), note: b.note,
    })
    return NextResponse.json(ev, { status: 201 })
  } catch (e) {
    console.error('POST /api/events error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
