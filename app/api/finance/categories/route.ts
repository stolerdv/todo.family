import { NextRequest, NextResponse } from 'next/server'
import { getCategories, createCategory } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    const spaceId = req.nextUrl.searchParams.get('spaceId')
    if (!user || !spaceId) return NextResponse.json([])
    return NextResponse.json(await getCategories(spaceId, user.userId))
  } catch (e) {
    console.error('GET /api/finance/categories error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { spaceId, kind, name, emoji } = await req.json()
    if ((kind !== 'expense' && kind !== 'income') || !name?.trim() || !spaceId) {
      return NextResponse.json({ error: 'spaceId, kind and name required' }, { status: 400 })
    }
    return NextResponse.json(await createCategory(spaceId, user.userId, kind, name.trim(), emoji || '•'), { status: 201 })
  } catch (e) {
    console.error('POST /api/finance/categories error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
