import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getSectionByCode, joinSection } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'
import { getLocaleFromCookies } from '@/lib/serverLocale'

export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const t = await getTranslations({ locale: getLocaleFromCookies(), namespace: 'auth.errors' })
  const section = await getSectionByCode(params.code)
  if (!section) return NextResponse.json({ error: t('sectionNotFound') }, { status: 404 })
  return NextResponse.json({ id: section.id, name: section.name })
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const t = await getTranslations({ locale: getLocaleFromCookies(), namespace: 'auth.errors' })
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: t('unauthorized') }, { status: 401 })
  const section = await getSectionByCode(params.code)
  if (!section) return NextResponse.json({ error: t('sectionNotFound') }, { status: 404 })
  if (section.userId === user.userId) {
    return NextResponse.json({ error: t('ownSection') }, { status: 400 })
  }
  await joinSection(section.id, user.userId)
  return NextResponse.json({ ok: true, sectionId: section.id, name: section.name })
}
