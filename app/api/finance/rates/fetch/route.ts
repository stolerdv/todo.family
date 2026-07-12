import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/getUser'

export const dynamic = 'force-dynamic'

// символ валюты приложения → ISO-код для внешнего API курсов
const CODE: Record<string, string> = { '₸': 'KZT', '€': 'EUR', '$': 'USD' }
const SYMBOL: Record<string, string> = { KZT: '₸', EUR: '€', USD: '$' }

// GET ?base=₸ — берёт живые курсы с бесплатного open.er-api.com (без ключа) и
// пересчитывает их в формат приложения: rates[валюта] = сколько base за 1 единицу валюты
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const base = req.nextUrl.searchParams.get('base') ?? '₸'
    const baseCode = CODE[base]
    if (!baseCode) return NextResponse.json({ error: 'unsupported base currency' }, { status: 400 })

    const res = await fetch(`https://open.er-api.com/v6/latest/${baseCode}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: 'rate provider unavailable' }, { status: 502 })
    const data = await res.json()
    if (data.result !== 'success' || !data.rates) return NextResponse.json({ error: 'rate provider error' }, { status: 502 })

    // API отдаёт "1 base = X валюты" (rates[EUR] = сколько евро в 1 KZT);
    // приложению нужно обратное — "1 валюта = X base", поэтому инвертируем
    const rates: Record<string, number> = {}
    for (const [code, symbol] of Object.entries(SYMBOL)) {
      if (symbol === base) continue
      const perBase = data.rates[code]
      if (typeof perBase === 'number' && perBase > 0) rates[symbol] = Math.round((1 / perBase) * 100) / 100
    }

    return NextResponse.json({ rates, updatedAt: data.time_last_update_utc ?? new Date().toISOString() })
  } catch (e) {
    console.error('GET /api/finance/rates/fetch error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
