import { defineEventHandler } from 'h3'
import type { FunctionReference } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import { privateConvexQuery } from '../../utils/private-convex'

const privateSystemOverview = (
  api as unknown as Record<string, { systemOverview: FunctionReference<'query'> }>
)['private/demo']!.systemOverview

export default defineEventHandler(async () => {
  try {
    const result = await privateConvexQuery(privateSystemOverview, {})

    return {
      ok: true,
      executedOn: 'server',
      helper: 'privateConvexQuery',
      source: 'privileged',
      functionPath: 'private/demo:systemOverview',
      result,
    }
  } catch (error) {
    return {
      ok: false,
      executedOn: 'server',
      message: error instanceof Error ? error.message : String(error),
      helper: error instanceof Error ? (error as Error & { helper?: string }).helper ?? null : null,
      source: error instanceof Error ? (error as Error & { source?: string }).source ?? null : null,
      operation:
        error instanceof Error ? (error as Error & { operation?: string }).operation ?? null : null,
      functionPath:
        error instanceof Error
          ? (error as Error & { functionPath?: string }).functionPath ?? null
          : null,
    }
  }
})
