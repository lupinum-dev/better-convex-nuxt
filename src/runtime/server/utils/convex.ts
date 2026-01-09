import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'

import { useRuntimeConfig } from '#imports'

import { parseConvexResponse, getFunctionName } from '../../utils/convex-shared'
import { createModuleLogger, getLoggingOptions, createTimer, formatArgsPreview } from '../../utils/logger'
import type { OperationCompleteEvent } from '../../utils/logger'

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
  const config = useRuntimeConfig()
  const loggingOptions = getLoggingOptions(config.public.convex ?? {})
  const logger = createModuleLogger(loggingOptions)
  const timer = createTimer()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options?.authToken) {
    headers['Authorization'] = `Bearer ${options.authToken}`
  }

  try {
    const response = await fetch(`${convexUrl}/api/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        path: functionPath,
        args: args ?? {},
      }),
    }).then((r) => r.json())

    const result = parseConvexResponse<FunctionReturnType<Query>>(response)

    logger.event({
      event: 'operation:complete',
      env: 'server',
      type: 'query',
      name: functionPath,
      duration_ms: timer(),
      outcome: 'success',
      args_preview: formatArgsPreview(args),
    } satisfies OperationCompleteEvent)

    return result
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    logger.event({
      event: 'operation:complete',
      env: 'server',
      type: 'query',
      name: functionPath,
      duration_ms: timer(),
      outcome: 'error',
      args_preview: formatArgsPreview(args),
      error: {
        type: err.name,
        message: err.message,
      },
    } satisfies OperationCompleteEvent)

    throw error
  }
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
  const config = useRuntimeConfig()
  const loggingOptions = getLoggingOptions(config.public.convex ?? {})
  const logger = createModuleLogger(loggingOptions)
  const timer = createTimer()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options?.authToken) {
    headers['Authorization'] = `Bearer ${options.authToken}`
  }

  try {
    const response = await fetch(`${convexUrl}/api/mutation`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        path: functionPath,
        args: args ?? {},
      }),
    }).then((r) => r.json())

    const result = parseConvexResponse<FunctionReturnType<Mutation>>(response)

    logger.event({
      event: 'operation:complete',
      env: 'server',
      type: 'mutation',
      name: functionPath,
      duration_ms: timer(),
      outcome: 'success',
      args_preview: formatArgsPreview(args),
    } satisfies OperationCompleteEvent)

    return result
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    logger.event({
      event: 'operation:complete',
      env: 'server',
      type: 'mutation',
      name: functionPath,
      duration_ms: timer(),
      outcome: 'error',
      args_preview: formatArgsPreview(args),
      error: {
        type: err.name,
        message: err.message,
      },
    } satisfies OperationCompleteEvent)

    throw error
  }
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
  const config = useRuntimeConfig()
  const loggingOptions = getLoggingOptions(config.public.convex ?? {})
  const logger = createModuleLogger(loggingOptions)
  const timer = createTimer()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options?.authToken) {
    headers['Authorization'] = `Bearer ${options.authToken}`
  }

  try {
    const response = await fetch(`${convexUrl}/api/action`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        path: functionPath,
        args: args ?? {},
      }),
    }).then((r) => r.json())

    const result = parseConvexResponse<FunctionReturnType<Action>>(response)

    logger.event({
      event: 'operation:complete',
      env: 'server',
      type: 'action',
      name: functionPath,
      duration_ms: timer(),
      outcome: 'success',
      args_preview: formatArgsPreview(args),
    } satisfies OperationCompleteEvent)

    return result
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    logger.event({
      event: 'operation:complete',
      env: 'server',
      type: 'action',
      name: functionPath,
      duration_ms: timer(),
      outcome: 'error',
      args_preview: formatArgsPreview(args),
      error: {
        type: err.name,
        message: err.message,
      },
    } satisfies OperationCompleteEvent)

    throw error
  }
}
