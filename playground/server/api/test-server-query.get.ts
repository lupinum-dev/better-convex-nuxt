import { defineEventHandler, createError, getQuery } from '#imports'

import { api } from '../../convex/_generated/api'

/**
 * Test API endpoint that demonstrates server-side queries using fetchQuery.
 *
 * This endpoint fetches notes using the Convex query from the server.
 * It shows how you can use fetchQuery in API routes or server middleware.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const convexUrl = config.public.convex?.url

  if (!convexUrl) {
    throw createError({ statusCode: 500, message: 'Convex URL not configured' })
  }

  const query = getQuery(event)
  const limit = Number(query.limit) || 5

  try {
    // Use the new fetchQuery utility!
    // This is the key feature being tested - server-side queries
    const notes = await fetchQuery(convexUrl, api.notes.list, {})

    // Take only the requested limit
    const limitedNotes = notes.slice(0, limit)

    return {
      success: true,
      count: limitedNotes.length,
      totalAvailable: notes.length,
      notes: limitedNotes,
      executedOn: 'server',
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch notes',
      error: String(error),
    }
  }
})
