import { NextRequest, NextResponse } from 'next/server'
import { deleteComment } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await deleteComment(params.id, user.userId)
  return NextResponse.json({ ok: true })
}
