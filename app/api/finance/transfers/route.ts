import { NextRequest, NextResponse } from 'next/server'
import { createTransfer } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

// POST { fromAccountId, toAccountId, amount, toAmount?, comment?, day? }
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    if (!b.fromAccountId || !b.toAccountId || b.fromAccountId === b.toAccountId || !(Number(b.amount) > 0)) {
      return NextResponse.json({ error: 'fromAccountId, toAccountId, amount required' }, { status: 400 })
    }
    const txn = await createTransfer(user.userId, {
      fromAccountId: b.fromAccountId, toAccountId: b.toAccountId,
      amount: Number(b.amount), toAmount: b.toAmount != null ? Number(b.toAmount) : undefined,
      comment: b.comment, day: b.day,
    })
    return NextResponse.json(txn, { status: 201 })
  } catch (e) {
    console.error('POST /api/finance/transfers error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
