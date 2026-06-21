import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { parseConvexResponse } from './convex-cache'
import { executeQueryViaSubscriptionOnce } from './one-shot-subscription'

/**
 * Execute query via HTTP on server or client without WebSocket state.
 *
 * @internal
 */
export async function executeQueryHttp<T>(
  convexUrl: string,
  functionPath: string,
  args: Record<string, unknown>,
  authToken?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const response = await $fetch(`${convexUrl}/api/query`, {
    method: 'POST',
    headers,
    body: { path: functionPath, args: args ?? {} },
  })

  return parseConvexResponse<T>(response)
}

/**
 * Execute a one-shot query using the WebSocket subscription client.
 *
 * @internal
 */
export function executeQueryViaSubscription<Query extends FunctionReference<'query'>>(
  convex: ConvexClient,
  query: Query,
  args: FunctionArgs<Query>,
  options?: { timeoutMs?: number },
): Promise<FunctionReturnType<Query>> {
  return executeQueryViaSubscriptionOnce(convex, query, args, options)
}
