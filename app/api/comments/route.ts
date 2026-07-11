import { NextRequest, NextResponse } from 'next/server'
import { getComments, createComment } from '@/lib/db'
import { getUserFromRequest } from '@/lib/getUser'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json([])
    const taskId = req.nextUrl.searchParams.get('taskId') ?? ''
    const comments = await getComments(taskId, user.userId)
    return NextResponse.json(comments)
  } catch (e) {
    console.error(e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { taskId, text } = await req.json()
    if (!taskId || !text?.trim()) return NextResponse.json({ error: 'Required' }, { status: 400 })
    const comment = await createComment(taskId, user.userId, user.username, text.trim())
    if (!comment) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(comment, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
