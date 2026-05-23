import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/register') ||
    pathname.startsWith('/api/join')
  ) {
    return NextResponse.next()
  }

  const token = req.cookies.get('auth_token')?.value
  if (!token || !(await verifyToken(token))) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
