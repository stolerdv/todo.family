import { NextRequest, NextResponse } from 'next/server'
import { getBudgets, setBudget } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET() {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json([])
    return NextResponse.json(await getBudgets(user.userId))
  } catch (e) {
    console.error('GET /api/finance/budgets error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

// PUT { categoryId, amount } — amount<=0 удаляет бюджет
export async function PUT(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { categoryId, amount } = await req.json()
    if (!categoryId) return NextResponse.json({ error: 'categoryId required' }, { status: 400 })
    await setBudget(user.userId, categoryId, Number(amount) || 0)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PUT /api/finance/budgets error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
