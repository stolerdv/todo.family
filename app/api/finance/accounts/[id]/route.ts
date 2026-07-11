import { NextRequest, NextResponse } from 'next/server'
import { updateAccount, deleteAccount } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    await updateAccount(params.id, user.userId, {
      ...(b.name      !== undefined && { name: b.name }),
      ...(b.type      !== undefined && { type: b.type }),
      ...(b.currency  !== undefined && { currency: b.currency }),
      ...(b.emoji     !== undefined && { emoji: b.emoji }),
      ...(b.color     !== undefined && { color: b.color }),
      ...(b.balance   !== undefined && { balance: b.balance }),
      ...(b.principal !== undefined && { principal: b.principal }),
      ...(b.startDate !== undefined && { startDate: b.startDate }),
      ...(b.archived  !== undefined && { archived: b.archived }),
      ...(b.sortOrder !== undefined && { sortOrder: b.sortOrder }),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/finance/accounts/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    await deleteAccount(params.id, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/finance/accounts/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
