import { NextRequest, NextResponse } from 'next/server'
import { getSubtasks, getSubtasksByUser, createSubtask } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json([])
    const taskId = req.nextUrl.searchParams.get('taskId') ?? undefined
    if (taskId) {
      const subtasks = await getSubtasks(taskId, user.userId)
      return NextResponse.json(subtasks)
    }
    const subtasks = await getSubtasksByUser(user.userId)
    return NextResponse.json(subtasks)
  } catch (e) {
    console.error('GET /api/subtasks error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { taskId, title } = await req.json()
    if (!taskId || !title?.trim()) {
      return NextResponse.json({ error: 'taskId and title required' }, { status: 400 })
    }
    const subtask = await createSubtask(taskId, title.trim(), user.userId)
    if (!subtask) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(subtask, { status: 201 })
  } catch (e) {
    console.error('POST /api/subtasks error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
