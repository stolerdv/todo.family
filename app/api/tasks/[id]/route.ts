import { NextRequest, NextResponse } from 'next/server'
import { updateTask, deleteTask, TaskState, Priority } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const body = await req.json()
    await updateTask(params.id, {
      ...(body.state    !== undefined && { state:    body.state    as TaskState }),
      ...(body.title    !== undefined && { title:    body.title }),
      ...(body.priority !== undefined && { priority: body.priority as Priority }),
      ...(body.dueDate  !== undefined && { dueDate:  body.dueDate }),
    }, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/tasks error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    await deleteTask(params.id, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/tasks error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
