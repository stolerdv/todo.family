import { NextRequest, NextResponse } from 'next/server'
import { getTasks, createTask } from '@/lib/sheets'

export async function GET(req: NextRequest) {
  try {
    const sectionId = req.nextUrl.searchParams.get('sectionId') ?? undefined
    const tasks = await getTasks(sectionId)
    return NextResponse.json(tasks)
  } catch (e) {
    console.error('GET /api/tasks error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const { sectionId, title } = await req.json()
  if (!sectionId || !title?.trim()) {
    return NextResponse.json({ error: 'sectionId and title required' }, { status: 400 })
  }
  const task = await createTask(sectionId, title.trim())
  return NextResponse.json(task, { status: 201 })
}
