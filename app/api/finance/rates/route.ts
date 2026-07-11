import { NextRequest, NextResponse } from 'next/server'
import { addRate } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

// POST { accountId, fromDate: 'YYYY-MM-DD', rate: number }
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { accountId, fromDate, rate } = await req.json()
    if (!accountId || !fromDate || rate === undefined || rate === null || isNaN(Number(rate))) {
      return NextResponse.json({ error: 'accountId, fromDate, rate required' }, { status: 400 })
    }
    const created = await addRate(accountId, user.userId, fromDate, Number(rate))
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    console.error('POST /api/finance/rates error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
