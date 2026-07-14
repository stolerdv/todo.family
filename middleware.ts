import { NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { verifyToken } from '@/lib/auth'
import { routing } from '@/i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

// убирает префикс языка (/en/xxx, /sk/xxx) — дефолтный ru без префикса, поэтому
// на нём и делать нечего. Нужно, чтобы применять один и тот же белый список
// (/login, /register, /join) независимо от того, на каком языке открыта страница.
function stripLocalePrefix(pathname: string): { base: string; locale: string } {
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return { base: pathname.slice(locale.length + 1) || '/', locale }
    }
  }
  return { base: pathname, locale: routing.defaultLocale }
}

const PUBLIC_BASE_PATHS = ['/login', '/register', '/join']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // API-роуты — locale-роутинг их вообще не касается (next-intl попытался бы
  // редиректить/переписывать сами fetch-запросы), только проверка авторизации,
  // точно как было раньше.
  if (pathname.startsWith('/api/')) {
    if (
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

  // Страницы: сначала даём next-intl разрешить/переписать locale.
  const intlResponse = intlMiddleware(req)
  // Если next-intl сам решил редиректить (например канонизирует лишний /ru/
  // префикс) — просто отдаём это, дальше запрос зайдёт в middleware заново.
  if (intlResponse.headers.get('location')) return intlResponse

  const { base, locale } = stripLocalePrefix(pathname)
  if (PUBLIC_BASE_PATHS.some(p => base === p || base.startsWith(p + '/'))) {
    return intlResponse
  }

  const token = req.cookies.get('auth_token')?.value
  if (!token || !(await verifyToken(token))) {
    const loginPath = locale === routing.defaultLocale ? '/login' : `/${locale}/login`
    return NextResponse.redirect(new URL(loginPath, req.url))
  }

  return intlResponse
}

export const config = {
  // не трогаем статику, манифест и иконки — они должны быть публичными (иначе PWA-иконка не грузится без входа)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|webmanifest)$).*)'],
}
