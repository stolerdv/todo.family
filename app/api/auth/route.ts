import { NextRequest, NextResponse } from 'next/server'
import { signToken } from '@/lib/auth'
import { verifyPassword, needsRehash, hashPassword } from '@/lib/password'
import { findUserByUsername, updateUserPassword } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 })
  }

  const user = await findUserByUsername(username)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 })
  }

  // прозрачно перехешируем старые (SHA-256) пароли в scrypt при успешном входе
  if (needsRehash(user.passwordHash)) {
    try { await updateUserPassword(user.id, hashPassword(password)) } catch (e) { console.error('rehash failed:', e) }
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
