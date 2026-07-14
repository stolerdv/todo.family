import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { signToken } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { findUserByUsername, createUser } from '@/lib/db'
import { getLocaleFromCookies } from '@/lib/serverLocale'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  const t = await getTranslations({ locale: getLocaleFromCookies(), namespace: 'auth.errors' })

  if (!username?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: t('credentialsRequired') }, { status: 400 })
  }

  const existing = await findUserByUsername(username.trim())
  if (existing) {
    return NextResponse.json({ error: t('usernameTaken') }, { status: 409 })
  }

  const user = await createUser(username.trim(), hashPassword(password))
  const token = await signToken(user.id, user.username)
  const res = NextResponse.json({ ok: true, username: user.username }, { status: 201 })
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
