import { NextRequest, NextResponse } from 'next/server'
import { deleteSection } from '@/lib/sheets'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteSection(params.id)
  return NextResponse.json({ ok: true })
}
