import { NextRequest, NextResponse } from 'next/server'
import { updateSpace, deleteSpace } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    await updateSpace(params.id, user.userId, {
      ...(b.name  !== undefined && { name: String(b.name).trim() }),
      ...(b.emoji !== undefined && { emoji: b.emoji }),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/finance/spaces/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    await deleteSpace(params.id, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/finance/spaces/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
