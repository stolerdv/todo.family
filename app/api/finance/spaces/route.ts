import { NextRequest, NextResponse } from 'next/server'
import { getSpaces, createSpace } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET() {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json([])
    return NextResponse.json(await getSpaces(user.userId))
  } catch (e) {
    console.error('GET /api/finance/spaces error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { name, emoji } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const created = await createSpace(user.userId, name.trim(), emoji || '💼')
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    console.error('POST /api/finance/spaces error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
