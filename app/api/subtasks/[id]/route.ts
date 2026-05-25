import { NextRequest, NextResponse } from 'next/server'
import { updateSubtask, deleteSubtask, Priority } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    await updateSubtask(params.id, {
      ...(body.done     !== undefined && { done:     body.done }),
      ...(body.note     !== undefined && { note:     body.note }),
      ...(body.priority !== undefined && { priority: body.priority as Priority }),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/subtasks error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteSubtask(params.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/subtasks error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
