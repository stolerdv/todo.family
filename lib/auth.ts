import { SignJWT, jwtVerify } from 'jose'

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) {
    // fail closed: без стойкого секрета токены подделываются → полный обход авторизации
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is not set (or too short) — refusing to sign/verify tokens')
    }
    return new TextEncoder().encode('dev-only-insecure-secret-change-me')
  }
  return new TextEncoder().encode(s)
}

export async function signToken(userId: string, username: string): Promise<string> {
  return new SignJWT({ userId, username })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<{ userId: string; username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return { userId: payload.userId as string, username: payload.username as string }
  } catch {
    return null
  }
}
