import { NextRequest, NextResponse } from 'next/server'
import { getAccounts, createAccount } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    const spaceId = req.nextUrl.searchParams.get('spaceId')
    if (!user || !spaceId) return NextResponse.json([])
    return NextResponse.json(await getAccounts(spaceId, user.userId))
  } catch (e) {
    console.error('GET /api/finance/accounts error:', e)
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
    const acc = await createAccount(b.spaceId, user.userId, {
      name: b.name.trim(), type: b.type, currency: b.currency, emoji: b.emoji, color: b.color,
      balance: b.balance, principal: b.principal, startDate: b.startDate, capitalization: b.capitalization,
    })
    return NextResponse.json(acc, { status: 201 })
  } catch (e) {
    console.error('POST /api/finance/accounts error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
