import { NextRequest, NextResponse } from 'next/server'
import { deleteComment } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteComment(params.id)
  return NextResponse.json({ ok: true })
}
