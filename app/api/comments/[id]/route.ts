import { NextRequest, NextResponse } from 'next/server'
import { deleteComment } from '@/lib/sheets'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteComment(params.id)
  return NextResponse.json({ ok: true })
}
