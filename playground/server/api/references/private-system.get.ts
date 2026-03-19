import { defineEventHandler } from 'h3'

import {
  PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH,
  privateSystemOverview,
} from '../../../private-function-references'
import { getPrivateBridgeReferenceState, privateConvexQuery } from '../../utils/private-convex'

export default defineEventHandler(async () => {
  const readiness = getPrivateBridgeReferenceState()
  if (!readiness.isConfigured) {
    return {
      ok: false,
      executedOn: 'server',
      helper: 'privateConvexQuery',
      source: 'privileged',
      functionPath: PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH,
      readiness,
      message: readiness.message,
    }
  }

  try {
    const result = await privateConvexQuery(privateSystemOverview, {})

    return {
      ok: true,
      executedOn: 'server',
      helper: 'privateConvexQuery',
      source: 'privileged',
      functionPath: PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH,
      readiness,
      result,
    }
  } catch (error) {
    return {
      ok: false,
      executedOn: 'server',
      readiness,
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
