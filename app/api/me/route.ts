import { NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET() {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ userId: user.userId, username: user.username })
}
