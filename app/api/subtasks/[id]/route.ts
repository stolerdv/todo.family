import { NextRequest, NextResponse } from 'next/server'
import { updateSubtask, deleteSubtask, Priority } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const body = await req.json()
    await updateSubtask(params.id, {
      ...(body.done     !== undefined && { done:     body.done }),
      ...(body.note     !== undefined && { note:     body.note }),
      ...(body.priority !== undefined && { priority: body.priority as Priority }),
    }, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/subtasks error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    await deleteSubtask(params.id, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/subtasks error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
