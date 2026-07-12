import { NextRequest, NextResponse } from 'next/server'
import { updateCredit, deleteCredit } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    await updateCredit(params.id, user.userId, {
      ...(b.kind             !== undefined && { kind: b.kind }),
      ...(b.direction        !== undefined && { direction: b.direction }),
      ...(b.name             !== undefined && { name: b.name }),
      ...(b.counterparty     !== undefined && { counterparty: b.counterparty }),
      ...(b.currency         !== undefined && { currency: b.currency }),
      ...(b.principal        !== undefined && { principal: b.principal }),
      ...(b.remaining        !== undefined && { remaining: b.remaining }),
      ...(b.rate             !== undefined && { rate: b.rate }),
      ...(b.monthlyPayment   !== undefined && { monthlyPayment: b.monthlyPayment }),
      ...(b.startDate        !== undefined && { startDate: b.startDate }),
      ...(b.dueDate          !== undefined && { dueDate: b.dueDate }),
      ...(b.nextPaymentDate  !== undefined && { nextPaymentDate: b.nextPaymentDate }),
      ...(b.comment          !== undefined && { comment: b.comment }),
      ...(b.archived         !== undefined && { archived: b.archived }),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH /api/finance/credits/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    await deleteCredit(params.id, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/finance/credits/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
