import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference } from 'convex/server'

import { useNuxtApp, useRequestEvent, useState } from '#imports'

import { handleUnauthorizedAuthFailure } from '../../auth/shared/auth-unauthorized.js'
import { ConvexCallError, toConvexError } from '../../utils/call-result.js'
import type { ConvexClientAuthMode } from '../../utils/types.js'
import { DEFAULT_SERVER_FETCH_TIMEOUT_MS } from '../server/http.js'
import { fetchAuthToken, getFunctionName, parseConvexResponse } from '../shared/convex-cache.js'
import { getConvexRuntimeConfig } from '../shared/runtime-config.js'
import { executeQueryViaSubscriptionOnce } from './one-shot-subscription.js'

export interface LiveQueryTransportOptions<Query extends FunctionReference<'query'>> {
  query: Query
  functionName?: string
  args: FunctionArgs<Query>
  subscribe: boolean
  authMode: ConvexClientAuthMode
}

export function normalizeQueryError(
  error: unknown,
  context: {
    functionName: string
    convexUrl?: string
    authMode?: ConvexClientAuthMode
  },
): ConvexCallError {
  const base = toConvexError(error)
  return new ConvexCallError(base.message, {
    cause: (base as Error & { cause?: unknown }).cause ?? error,
    code: base.code,
    status: base.status,
    helper: base.helper,
    operation: 'query',
    functionPath: base.functionPath ?? context.functionName,
    convexUrl: base.convexUrl ?? context.convexUrl,
    authMode: base.authMode ?? context.authMode,
    category: base.category,
    issues: base.issues,
  })
}

export async function executeQueryHttp<T>(
  convexUrl: string,
  functionPath: string,
  args: Record<string, unknown>,
  authToken?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }

  const response = await $fetch(`${convexUrl}/api/query`, {
    method: 'POST',
    headers,
    timeout: DEFAULT_SERVER_FETCH_TIMEOUT_MS,
    body: { path: functionPath, args: args ?? {} },
  })

  return parseConvexResponse<T>(response)
}

export async function executeLiveQuery<Query extends FunctionReference<'query'>, Result>(
  options: LiveQueryTransportOptions<Query>,
): Promise<Result> {
  const { query, args, subscribe, authMode } = options
  const functionName = options.functionName ?? getFunctionName(query)
  const nuxtApp = useNuxtApp()
  const convexConfig = getConvexRuntimeConfig()
  const convexUrl = convexConfig.url

  if (!convexUrl) {
    throw new Error('[trellis] Convex URL not configured')
  }

  const cookieHeader = import.meta.server ? useRequestEvent()?.headers.get('cookie') || '' : ''
  const cachedToken = useState<string | null>('convex:token')

  try {
    if (import.meta.server) {
      const authToken = await fetchAuthToken({
        auth: authMode,
        cookieHeader,
        siteUrl: convexConfig.siteUrl,
        cachedToken,
      })
      return await executeQueryHttp<Result>(
        convexUrl,
        functionName,
        (args ?? {}) as Record<string, unknown>,
        authToken,
      )
    }

    if (!subscribe) {
      const authToken = authMode === 'none' ? undefined : (cachedToken.value ?? undefined)
      return await executeQueryHttp<Result>(
        convexUrl,
        functionName,
        (args ?? {}) as Record<string, unknown>,
        authToken,
      )
    }

    const convex = nuxtApp.$convex as ConvexClient | undefined
    if (!convex) {
      throw new Error('[trellis] Convex client not available')
    }

    return await executeQueryViaSubscriptionOnce(convex, query, args)
  } catch (error) {
    if (import.meta.client) {
      void handleUnauthorizedAuthFailure({
        error,
        source: 'query',
        functionName,
      })
    }
    throw normalizeQueryError(error, { functionName, convexUrl, authMode })
  }
}
