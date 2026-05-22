import { SignJWT, jwtVerify } from 'jose'
import { createHash } from 'crypto'

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'fallback-secret-change-me')

export async function signToken(userId: string, username: string): Promise<string> {
  return new SignJWT({ userId, username })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret)
}

export async function verifyToken(token: string): Promise<{ userId: string; username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return { userId: payload.userId as string, username: payload.username as string }
  } catch {
    return null
  }
}

export function hashPassword(password: string): string {
  const salt = Math.random().toString(36).slice(2)
  const hash = createHash('sha256').update(salt + password).digest('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  return createHash('sha256').update(salt + password).digest('hex') === hash
}
