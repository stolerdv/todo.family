import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, signToken } from '@/lib/auth'
import { findUserByUsername, createUser } from '@/lib/sheets'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  if (!username?.trim() || !password || password.length < 4) {
    return NextResponse.json({ error: 'Логин и пароль (мин. 4 символа) обязательны' }, { status: 400 })
  }

  const existing = await findUserByUsername(username.trim())
  if (existing) {
    return NextResponse.json({ error: 'Такой пользователь уже существует' }, { status: 409 })
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
