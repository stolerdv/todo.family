import { NextRequest, NextResponse } from 'next/server'
import { getFreeBudget, setFreeBudget } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    const spaceId = req.nextUrl.searchParams.get('spaceId')
    if (!user || !spaceId) return NextResponse.json({ amount: null })
    const amount = await getFreeBudget(spaceId, user.userId)
    return NextResponse.json({ amount })
  } catch (e) {
    console.error('GET /api/finance/free-budget error:', e)
    return NextResponse.json({ amount: null }, { status: 200 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { spaceId, amount } = await req.json()
    if (!spaceId) return NextResponse.json({ error: 'spaceId required' }, { status: 400 })
    await setFreeBudget(spaceId, user.userId, amount == null ? null : Number(amount))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PUT /api/finance/free-budget error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
