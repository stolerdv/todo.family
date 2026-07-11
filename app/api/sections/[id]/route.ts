import { NextRequest, NextResponse } from 'next/server'
import { deleteSection, archiveSection } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await deleteSection(params.id, user.userId)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { archived } = await req.json()
  await archiveSection(params.id, archived, user.userId)
  return NextResponse.json({ ok: true })
}
