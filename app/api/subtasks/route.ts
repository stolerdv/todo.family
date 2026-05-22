import { NextRequest, NextResponse } from 'next/server'
import { getSubtasks, createSubtask } from '@/lib/sheets'

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get('taskId') ?? undefined
    const subtasks = await getSubtasks(taskId)
    return NextResponse.json(subtasks)
  } catch (e) {
    console.error('GET /api/subtasks error:', e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { taskId, title } = await req.json()
    if (!taskId || !title?.trim()) {
      return NextResponse.json({ error: 'taskId and title required' }, { status: 400 })
    }
    const subtask = await createSubtask(taskId, title.trim())
    return NextResponse.json(subtask, { status: 201 })
  } catch (e) {
    console.error('POST /api/subtasks error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
