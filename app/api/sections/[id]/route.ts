import { NextRequest, NextResponse } from 'next/server'
import { deleteSection, archiveSection } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteSection(params.id)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { archived } = await req.json()
  await archiveSection(params.id, archived)
  return NextResponse.json({ ok: true })
}
