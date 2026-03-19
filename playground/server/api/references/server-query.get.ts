import type { H3Event } from 'h3'
import { defineEventHandler } from 'h3'

import { serverConvexQuery } from '../../../../src/runtime/server/utils/convex'
import { api } from '../../../convex/_generated/api'

export default defineEventHandler(async (event: H3Event) => {
  try {
    const notes = await serverConvexQuery(event, api.notes.list, {})

    return {
      ok: true,
      executedOn: 'server',
      count: notes.length,
      sample: notes.slice(0, 3),
    }
  } catch (error) {
    return {
      ok: false,
      executedOn: 'server',
      message: error instanceof Error ? error.message : String(error),
    }
  }
})
