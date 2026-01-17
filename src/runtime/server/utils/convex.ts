import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'

import { useRuntimeConfig } from '#imports'

import { parseConvexResponse, getFunctionName } from '../../utils/convex-shared'
import { createLogger, getLogLevel } from '../../utils/logger'

/**
 * Options for server-side Convex operations
 */
export interface FetchOptions {
  /**
   * Auth token for authenticated operations.
   * If not provided, the operation runs as unauthenticated.
   */
  authToken?: string
}

/**
 * Internal type for operation type strings
 */
type ConvexOperationType = 'query' | 'mutation' | 'action'

/**
 * Execute a Convex operation via HTTP.
 * Shared implementation for queries, mutations, and actions.
 *
 * @internal
 */
async function executeConvexOperation<T>(
  convexUrl: string,
  operationType: ConvexOperationType,
  functionPath: string,
  args: Record<string, unknown> | undefined,
  options?: FetchOptions,
): Promise<T> {
  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = createLogger(logLevel)
  const startTime = Date.now()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options?.authToken) {
    headers['Authorization'] = `Bearer ${options.authToken}`
  }

  // Helper to log based on operation type
  const logSuccess = (duration: number) => {
    if (operationType === 'query') {
      logger.query({ name: functionPath, event: 'update', args })
    } else if (operationType === 'mutation') {
      logger.mutation({ name: functionPath, event: 'success', args, duration })
    } else {
      logger.action({ name: functionPath, event: 'success', duration })
    }
  }

  const logError = (err: Error, duration: number) => {
    if (operationType === 'query') {
      logger.query({ name: functionPath, event: 'error', args, error: err })
    } else if (operationType === 'mutation') {
      logger.mutation({ name: functionPath, event: 'error', args, duration, error: err })
    } else {
      logger.action({ name: functionPath, event: 'error', duration, error: err })
    }
  }

  try {
    const response = await fetch(`${convexUrl}/api/${operationType}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        path: functionPath,
        args: args ?? {},
      }),
    })

    // Handle non-JSON responses gracefully
    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('application/json')) {
      const text = await response.text()
      throw new Error(`Unexpected response type: ${contentType}. Body: ${text.slice(0, 200)}`)
    }

    const json = await response.json()
    const result = parseConvexResponse<T>(json)

    const duration = Date.now() - startTime
    logSuccess(duration)

    return result
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const duration = Date.now() - startTime
    logError(err, duration)
    throw error
  }
}

/**
 * Execute a one-off query on the server via HTTP.
 * Useful in API routes, server middleware, or webhooks.
 *
 * @example
 * ```typescript
 * // server/api/tasks.get.ts
 * export default defineEventHandler(async (event) => {
 *   const config = useRuntimeConfig()
 *   const tasks = await fetchQuery(
 *     config.public.convex.url,
 *     api.tasks.list,
 *     { status: 'active' }
 *   )
 *   return tasks
 * })
 * ```
 */
export async function fetchQuery<Query extends FunctionReference<'query'>>(
  convexUrl: string,
  query: Query,
  args?: FunctionArgs<Query>,
  options?: FetchOptions,
): Promise<FunctionReturnType<Query>> {
  const functionPath = getFunctionName(query)
  return executeConvexOperation<FunctionReturnType<Query>>(
    convexUrl,
    'query',
    functionPath,
    args as Record<string, unknown> | undefined,
    options,
  )
}

/**
 * Execute a mutation on the server via HTTP.
 * Useful in API routes, webhooks, or background jobs.
 *
 * @example
 * ```typescript
 * // server/api/webhook.post.ts
 * export default defineEventHandler(async (event) => {
 *   const config = useRuntimeConfig()
 *   const body = await readBody(event)
 *
 *   await fetchMutation(
 *     config.public.convex.url,
 *     api.tasks.complete,
 *     { taskId: body.taskId }
 *   )
 *
 *   return { success: true }
 * })
 * ```
 */
export async function fetchMutation<Mutation extends FunctionReference<'mutation'>>(
  convexUrl: string,
  mutation: Mutation,
  args?: FunctionArgs<Mutation>,
  options?: FetchOptions,
): Promise<FunctionReturnType<Mutation>> {
  const functionPath = getFunctionName(mutation)
  return executeConvexOperation<FunctionReturnType<Mutation>>(
    convexUrl,
    'mutation',
    functionPath,
    args as Record<string, unknown> | undefined,
    options,
  )
}

/**
 * Execute an action on the server via HTTP.
 * Useful for long-running operations from API routes or webhooks.
 *
 * @example
 * ```typescript
 * // server/api/send-email.post.ts
 * export default defineEventHandler(async (event) => {
 *   const config = useRuntimeConfig()
 *   const body = await readBody(event)
 *
 *   const result = await fetchAction(
 *     config.public.convex.url,
 *     api.email.send,
 *     { to: body.email, subject: body.subject }
 *   )
 *
 *   return result
 * })
 * ```
 */
export async function fetchAction<Action extends FunctionReference<'action'>>(
  convexUrl: string,
  action: Action,
  args?: FunctionArgs<Action>,
  options?: FetchOptions,
): Promise<FunctionReturnType<Action>> {
  const functionPath = getFunctionName(action)
  return executeConvexOperation<FunctionReturnType<Action>>(
    convexUrl,
    'action',
    functionPath,
    args as Record<string, unknown> | undefined,
    options,
  )
}
