import { NextRequest, NextResponse } from 'next/server'
import { leaveSection } from '@/lib/sheets'
import { getUserFromRequest } from '@/lib/getUser'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await leaveSection(params.id, user.userId)
  return NextResponse.json({ ok: true })
}
