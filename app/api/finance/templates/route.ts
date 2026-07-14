import { NextRequest, NextResponse } from 'next/server'
import { getTemplates, createTemplate } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    const spaceId = req.nextUrl.searchParams.get('spaceId')
    if (!user || !spaceId) return NextResponse.json([])
    return NextResponse.json(await getTemplates(spaceId, user.userId))
  } catch (e) {
    console.error('GET /api/finance/templates error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const b = await req.json()
    if (!b.spaceId || !b.name?.trim() || !b.accountId || !(Number(b.amount) > 0)) {
      return NextResponse.json({ error: 'spaceId, name, accountId and amount required' }, { status: 400 })
    }
    const created = await createTemplate(b.spaceId, user.userId, {
      kind: b.kind === 'income' ? 'income' : 'expense',
      name: b.name.trim(), accountId: b.accountId, category: b.category ?? '', amount: Number(b.amount), comment: b.comment ?? '',
    })
    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    if (e?.message === 'limit') return NextResponse.json({ error: 'limit' }, { status: 400 })
    console.error('POST /api/finance/templates error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
