import { NextRequest, NextResponse } from 'next/server'
import { updateEvent, deleteEvent } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    await updateEvent(params.id, user.userId, {
      ...(b.title   !== undefined && { title: b.title }),
      ...(b.time    !== undefined && { time: b.time }),
      ...(b.endTime !== undefined && { endTime: b.endTime }),
      ...(b.note    !== undefined && { note: b.note }),
      ...(b.day     !== undefined && { day: b.day }),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/events/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    await deleteEvent(params.id, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/events/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
