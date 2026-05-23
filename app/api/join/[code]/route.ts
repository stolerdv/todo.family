import { NextRequest, NextResponse } from 'next/server'
import { getSectionByCode, joinSection } from '@/lib/sheets'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const section = await getSectionByCode(params.code)
  if (!section) return NextResponse.json({ error: 'Раздел не найден' }, { status: 404 })
  return NextResponse.json({ id: section.id, name: section.name })
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const section = await getSectionByCode(params.code)
  if (!section) return NextResponse.json({ error: 'Раздел не найден' }, { status: 404 })
  if (section.userId === user.userId) {
    return NextResponse.json({ error: 'Это ваш собственный раздел' }, { status: 400 })
  }
  await joinSection(section.id, user.userId)
  return NextResponse.json({ ok: true, sectionId: section.id, name: section.name })
}
