import { defineEventHandler, readBody, createError } from 'h3'

import { serverConvexMutation } from '../../../../src/runtime/convex/server/convex'
import { api } from '../../convex/_generated/api'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: string; content?: string }>(event)

  const title = body?.title || `Server Note ${new Date().toISOString()}`
  const content = body?.content || 'Created from server-side API route using serverConvexMutation'

  try {
    const noteId = await serverConvexMutation(
      event,
      api.notes.add,
      { title, content },
      { auth: 'none' },
    )

    return {
      success: true,
      message: 'Note created from server!',
      noteId,
      createdAt: new Date().toISOString(),
      meta: {
        title,
        content,
        executedOn: 'server',
      },
    }
  } catch (error) {
    if (
      import.meta.dev &&
      error instanceof Error &&
      error.message.includes('Convex URL not configured')
    ) {
      throw createError({ statusCode: 500, message: error.message })
    }
    return {
      success: false,
      message: 'Failed to create note',
      error: String(error),
    }
  }
})
