import { NextRequest, NextResponse } from 'next/server'
import { getTxns, createTxn } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    const spaceId = req.nextUrl.searchParams.get('spaceId')
    if (!user || !spaceId) return NextResponse.json([])
    return NextResponse.json(await getTxns(spaceId, user.userId))
  } catch (e) {
    console.error('GET /api/finance/txns error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    if (!b.accountId || (b.type !== 'expense' && b.type !== 'income') || !(Number(b.amount) > 0)) {
      return NextResponse.json({ error: 'accountId, type, amount required' }, { status: 400 })
    }
    const result = await createTxn(user.userId, {
      accountId: b.accountId, type: b.type, amount: Number(b.amount),
      category: b.category, comment: b.comment, day: b.day,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    console.error('POST /api/finance/txns error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
