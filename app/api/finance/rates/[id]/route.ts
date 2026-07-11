import { NextRequest, NextResponse } from 'next/server'
import { deleteRate } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    await deleteRate(params.id, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/finance/rates/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
