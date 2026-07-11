import { NextRequest, NextResponse } from 'next/server'
import { getCategories, createCategory } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET() {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json([])
    return NextResponse.json(await getCategories(user.userId))
  } catch (e) {
    console.error('GET /api/finance/categories error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { kind, name, emoji } = await req.json()
    if ((kind !== 'expense' && kind !== 'income') || !name?.trim()) {
      return NextResponse.json({ error: 'kind and name required' }, { status: 400 })
    }
    return NextResponse.json(await createCategory(user.userId, kind, name.trim(), emoji || '•'), { status: 201 })
  } catch (e) {
    console.error('POST /api/finance/categories error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
