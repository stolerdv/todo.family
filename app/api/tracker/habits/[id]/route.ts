import { NextRequest, NextResponse } from 'next/server'
import { updateHabit, deleteHabit } from '@/lib/tracker'
import { getUserFromRequest } from '@/lib/getUser'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    await updateHabit(params.id, user.userId, {
      ...(b.name        !== undefined && { name: b.name }),
      ...(b.description !== undefined && { description: b.description }),
      ...(b.emoji       !== undefined && { emoji: b.emoji }),
      ...(b.color       !== undefined && { color: b.color }),
      ...(b.schedule    !== undefined && { schedule: b.schedule }),
      ...(b.startDate   !== undefined && { startDate: b.startDate }),
      ...(b.targetPerDay !== undefined && { targetPerDay: b.targetPerDay }),
      ...(b.archived    !== undefined && { archived: b.archived }),
      ...(b.sortOrder   !== undefined && { sortOrder: b.sortOrder }),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/tracker/habits/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    await deleteHabit(params.id, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/tracker/habits/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
