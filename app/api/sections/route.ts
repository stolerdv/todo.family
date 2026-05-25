import { NextRequest, NextResponse } from 'next/server'
import { getSections, createSection } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET() {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json([], { status: 200 })
    const sections = await getSections(user.userId)
    return NextResponse.json(sections)
  } catch (e) {
    console.error('GET /api/sections error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { name } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    const section = await createSection(name.trim(), user.userId)
    return NextResponse.json(section, { status: 201 })
  } catch (e) {
    console.error('POST /api/sections error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
