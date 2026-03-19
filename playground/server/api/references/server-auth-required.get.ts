import type { H3Event } from 'h3'
import { defineEventHandler } from 'h3'

import { serverConvexQuery } from '../../../../src/runtime/server/utils/convex'
import { api } from '../../../convex/_generated/api'

export default defineEventHandler(async (event: H3Event) => {
  try {
    const tasks = await serverConvexQuery(event, api.tasks.list, {}, { auth: 'required' })

    return {
      ok: true,
      executedOn: 'server',
      source: 'user-scoped',
      count: tasks.length,
      sample: tasks.slice(0, 3),
    }
  } catch (error) {
    return {
      ok: false,
      executedOn: 'server',
      source: 'user-scoped',
      message: error instanceof Error ? error.message : String(error),
      helper: error instanceof Error ? (error as Error & { helper?: string }).helper ?? null : null,
      functionPath:
        error instanceof Error
          ? (error as Error & { functionPath?: string }).functionPath ?? null
          : null,
      authMode:
        error instanceof Error ? (error as Error & { authMode?: string }).authMode ?? null : null,
    }
  }
})
