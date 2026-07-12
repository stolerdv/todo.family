import { NextRequest, NextResponse } from 'next/server'
import { deleteTxn, editTxn } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

// правка расхода/дохода: сумма/категория/комментарий/дата. Балансы счёта донастраиваются атомарно.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    const result = await editTxn(params.id, user.userId, {
      ...(b.amount   !== undefined && { amount: Number(b.amount) }),
      ...(b.category !== undefined && { category: b.category }),
      ...(b.comment  !== undefined && { comment: b.comment }),
      ...(b.day      !== undefined && { day: b.day }),
    })
    if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(result)
  } catch (e) {
    console.error('PATCH /api/finance/txns/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

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
