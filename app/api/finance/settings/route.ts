import { NextRequest, NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

// не даём Next запечь роут статически: try/catch глотает DynamicServerError от cookies()
export const dynamic = 'force-dynamic'

// Курсы валют глобальные — одни на все кабинеты пользователя, не привязаны к spaceId.
export async function GET() {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ baseCurrency: '', rates: {} })
    return NextResponse.json(await getSettings(user.userId))
  } catch (e) {
    console.error('GET /api/finance/settings error:', e)
    return NextResponse.json({ baseCurrency: '', rates: {} }, { status: 200 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { baseCurrency, rates } = await req.json()
    await saveSettings(user.userId, String(baseCurrency ?? ''), rates && typeof rates === 'object' ? rates : {})
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PUT /api/finance/settings error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
