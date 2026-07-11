import { NextRequest, NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

// не даём Next запечь роут статически: try/catch глотает DynamicServerError от cookies()
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    const spaceId = req.nextUrl.searchParams.get('spaceId')
    if (!user || !spaceId) return NextResponse.json({ baseCurrency: '', rates: {} })
    return NextResponse.json(await getSettings(spaceId, user.userId))
  } catch (e) {
    console.error('GET /api/finance/settings error:', e)
    return NextResponse.json({ baseCurrency: '', rates: {} }, { status: 200 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { spaceId, baseCurrency, rates } = await req.json()
    if (!spaceId) return NextResponse.json({ error: 'spaceId required' }, { status: 400 })
    await saveSettings(spaceId, user.userId, String(baseCurrency ?? ''), rates && typeof rates === 'object' ? rates : {})
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PUT /api/finance/settings error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
