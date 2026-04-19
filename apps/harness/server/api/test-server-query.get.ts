import { defineEventHandler, createError, getQuery } from 'h3'

import { serverConvexQuery } from '../../../../src/runtime/convex/server/convex'
import { api } from '../../convex/_generated/api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Number(query.limit) || 5

  try {
    const notes = await serverConvexQuery(event, api.notes.list, {}, { auth: 'none' })
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
    if (
      import.meta.dev &&
      error instanceof Error &&
      error.message.includes('Convex URL not configured')
    ) {
      throw createError({ statusCode: 500, message: error.message })
    }
    return {
      success: false,
      message: 'Failed to fetch notes',
      error: String(error),
    }
  }
})
