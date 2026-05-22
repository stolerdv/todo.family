import { NextRequest, NextResponse } from 'next/server'
import { updateTaskState, updateTaskTitle, deleteTask, TaskState } from '@/lib/sheets'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  if (body.state !== undefined) await updateTaskState(params.id, body.state as TaskState)
  if (body.title !== undefined) await updateTaskTitle(params.id, body.title)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteTask(params.id)
  return NextResponse.json({ ok: true })
}
