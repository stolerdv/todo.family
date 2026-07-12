import { NextRequest, NextResponse } from 'next/server'
import { deleteCreditPayment } from '@/lib/finance'
import { getUserFromRequest } from '@/lib/getUser'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const result = await deleteCreditPayment(params.id, user.userId)
    if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(result)
  } catch (e) {
    console.error('DELETE /api/finance/credits/payments/[id] error:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
