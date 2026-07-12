import { NextRequest, NextResponse } from 'next/server'
import { getCredits, createCredit } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    const spaceId = req.nextUrl.searchParams.get('spaceId')
    if (!user || !spaceId) return NextResponse.json([])
    return NextResponse.json(await getCredits(spaceId, user.userId))
  } catch (e) {
    console.error('GET /api/finance/credits error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    if (!b.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
    if (!b.spaceId) return NextResponse.json({ error: 'spaceId required' }, { status: 400 })
    if (!['credit', 'debt', 'installment'].includes(b.kind)) return NextResponse.json({ error: 'invalid kind' }, { status: 400 })
    const credit = await createCredit(b.spaceId, user.userId, {
      kind: b.kind, direction: b.direction, name: b.name.trim(), counterparty: b.counterparty,
      currency: b.currency, principal: b.principal, remaining: b.remaining, rate: b.rate,
      monthlyPayment: b.monthlyPayment, startDate: b.startDate, dueDate: b.dueDate,
      nextPaymentDate: b.nextPaymentDate, comment: b.comment,
    })
    return NextResponse.json(credit, { status: 201 })
  } catch (e) {
    console.error('POST /api/finance/credits error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
