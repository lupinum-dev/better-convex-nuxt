import type { H3Event } from 'h3'
import { defineEventHandler, readBody, createError } from 'h3'

import { api } from '#convex/api'
import { serverConvex } from '#convex/server'

/**
 * Test API endpoint that demonstrates server-side mutations using serverConvex.
 *
 * This endpoint creates a new note using the Convex mutation from the server.
 * It shows how you can use serverConvex in API routes, webhooks, or background jobs.
 */
export default defineEventHandler(async (event: H3Event) => {
  // Read the request body
  const body = await readBody<{ title?: string; content?: string }>(event)

  const title = body?.title || `Server Note ${new Date().toISOString()}`
  const content = body?.content || 'Created from server-side API route using serverConvex'

  try {
    // Use the new serverConvex caller!
    // This is the key feature being tested - server-side mutations
    const noteId = await serverConvex(event).mutation(api.notes.add, { title, content })

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
      error.message.includes('Convex URL is not configured')
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
