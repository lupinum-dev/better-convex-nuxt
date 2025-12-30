import { defineEventHandler, readBody, createError } from '#imports'

import { api } from '../../convex/_generated/api'

/**
 * Test API endpoint that demonstrates server-side mutations using fetchMutation.
 *
 * This endpoint creates a new note using the Convex mutation from the server.
 * It shows how you can use fetchMutation in API routes, webhooks, or background jobs.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const convexUrl = config.public.convex?.url

  if (!convexUrl) {
    throw createError({ statusCode: 500, message: 'Convex URL not configured' })
  }

  // Read the request body
  const body = await readBody<{ title?: string; content?: string }>(event)

  const title = body?.title || `Server Note ${new Date().toISOString()}`
  const content = body?.content || 'Created from server-side API route using fetchMutation'

  try {
    // Use the new fetchMutation utility!
    // This is the key feature being tested - server-side mutations
    const noteId = await fetchMutation(convexUrl, api.notes.add, { title, content })

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
    return {
      success: false,
      message: 'Failed to create note',
      error: String(error),
    }
  }
})
