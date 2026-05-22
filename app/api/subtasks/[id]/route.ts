import { NextRequest, NextResponse } from 'next/server'
import { toggleSubtask, deleteSubtask } from '@/lib/sheets'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { done, note } = await req.json()
    await toggleSubtask(params.id, done, note)
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
