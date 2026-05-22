import { NextRequest, NextResponse } from 'next/server'
import { signToken, verifyPassword } from '@/lib/auth'
import { findUserByUsername } from '@/lib/sheets'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  const user = await findUserByUsername(username)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 })
  }

  const token = await signToken(user.id, user.username)
  const res = NextResponse.json({ ok: true, username: user.username })
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('auth_token')
  return res
}
