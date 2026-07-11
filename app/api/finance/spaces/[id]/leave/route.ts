import { NextRequest, NextResponse } from 'next/server'
import { leaveSpace } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    await leaveSpace(params.id, user.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/finance/spaces/[id]/leave error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
