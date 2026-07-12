import { NextRequest, NextResponse } from 'next/server'
import { createCreditPayment } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

// POST { accountId?, amount, day?, comment?, advanceNextPayment? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    if (!(Number(b.amount) > 0)) return NextResponse.json({ error: 'amount required' }, { status: 400 })
    const result = await createCreditPayment(params.id, user.userId, {
      accountId: b.accountId ?? null, amount: Number(b.amount), day: b.day, comment: b.comment,
      advanceNextPayment: !!b.advanceNextPayment,
    })
    if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    console.error('POST /api/finance/credits/[id]/payments error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
