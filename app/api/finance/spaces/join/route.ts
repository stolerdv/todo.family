import { NextRequest, NextResponse } from 'next/server'
import { joinSpaceByCode } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

// POST { code } — подключиться к кабинету по share-коду
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { code } = await req.json()
    if (!code?.trim()) return NextResponse.json({ error: 'code required' }, { status: 400 })
    const space = await joinSpaceByCode(code, user.userId)
    if (!space) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(space)
  } catch (e) {
    console.error('POST /api/finance/spaces/join error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
