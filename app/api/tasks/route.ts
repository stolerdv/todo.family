import { NextRequest, NextResponse } from 'next/server'
import { getTasks, getTasksByUser, createTask } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json([])
    const sectionId = req.nextUrl.searchParams.get('sectionId') ?? undefined
    if (sectionId) {
      const tasks = await getTasks(sectionId, user.userId)
      return NextResponse.json(tasks)
    }
    const tasks = await getTasksByUser(user.userId)
    return NextResponse.json(tasks)
  } catch (e) {
    console.error('GET /api/tasks error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { sectionId, title } = await req.json()
  if (!sectionId || !title?.trim()) {
    return NextResponse.json({ error: 'sectionId and title required' }, { status: 400 })
  }
  const task = await createTask(sectionId, title.trim(), user.userId)
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(task, { status: 201 })
}
