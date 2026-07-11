import { NextRequest, NextResponse } from 'next/server'
import { deleteTxn } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const result = await deleteTxn(params.id, user.userId)
    return NextResponse.json(result ?? { reverts: [] })
  } catch (e) {
    console.error('DELETE /api/finance/txns/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
