import { cookies } from 'next/headers'
import { verifyToken } from './auth'

export async function getUserFromRequest(): Promise<{ userId: string; username: string } | null> {
  const token = cookies().get('auth_token')?.value
  if (!token) return null
  return verifyToken(token)
}
