import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'

import { useRuntimeConfig } from '#imports'

import { parseConvexResponse, getFunctionName } from '../../utils/convex-shared'

/**
 * Options for server-side Convex operations
 */
export interface FetchOptions {
  /**
   * Auth token for authenticated operations.
   * If not provided, the operation runs as unauthenticated.
   */
  authToken?: string

  /**
   * Enable verbose logging for debugging.
   * Logs function calls, args, and results.
   * @default false
   */
  verbose?: boolean
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
  const verbose = options?.verbose ?? (config.public.convex?.verbose ?? false)

  const log = verbose
    ? (message: string, data?: unknown) => {
        const prefix = `[fetchQuery] ${functionPath}: `
        if (data !== undefined) {
          console.log(prefix + message, data)
        } else {
          console.log(prefix + message)
        }
      }
    : () => {}

  log('Starting', { args, hasAuth: !!options?.authToken })

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
    log('Success', result)
    return result
  } catch (error) {
    log('Error', error instanceof Error ? error.message : String(error))
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
  const verbose = options?.verbose ?? (config.public.convex?.verbose ?? false)

  const log = verbose
    ? (message: string, data?: unknown) => {
        const prefix = `[fetchMutation] ${functionPath}: `
        if (data !== undefined) {
          console.log(prefix + message, data)
        } else {
          console.log(prefix + message)
        }
      }
    : () => {}

  log('Starting', { args, hasAuth: !!options?.authToken })

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
    log('Success', result)
    return result
  } catch (error) {
    log('Error', error instanceof Error ? error.message : String(error))
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
  const verbose = options?.verbose ?? (config.public.convex?.verbose ?? false)

  const log = verbose
    ? (message: string, data?: unknown) => {
        const prefix = `[fetchAction] ${functionPath}: `
        if (data !== undefined) {
          console.log(prefix + message, data)
        } else {
          console.log(prefix + message)
        }
      }
    : () => {}

  log('Starting', { args, hasAuth: !!options?.authToken })

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
    log('Success', result)
    return result
  } catch (error) {
    log('Error', error instanceof Error ? error.message : String(error))
    throw error
  }
}
