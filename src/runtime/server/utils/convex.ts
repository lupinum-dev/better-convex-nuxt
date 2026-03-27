import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import type { H3Event } from 'h3'

import { useRequestEvent, useRuntimeConfig } from '#imports'

import { ConvexCallError, toConvexError } from '../../utils/call-result'
import { parseConvexResponse, getFunctionName } from '../../utils/convex-shared'
import { createLogger, getLogLevel } from '../../utils/logger'
import { normalizeConvexRuntimeConfig } from '../../utils/runtime-config'
import type { ConvexServerAuthMode } from '../../utils/types'
import { resolveRequestAuthToken } from './auth-resolver'

type ConvexOperationType = 'query' | 'mutation' | 'action'
type ServerConvexHelperName = 'serverConvexQuery' | 'serverConvexMutation' | 'serverConvexAction'

interface ServerConvexErrorContext {
  helper: ServerConvexHelperName
  operation: ConvexOperationType
  functionPath: string
  convexUrl?: string
  authMode: ConvexServerAuthMode
}

export interface ServerConvexOptions {
  /**
   * Auth policy for this call.
   * - 'auto': use session cookie when available (default)
   * - 'required': throw when auth token cannot be resolved
   * - 'none': never attach auth
   */
  auth?: ConvexServerAuthMode
  /**
   * Explicit auth token override. When provided, skips auto resolution.
   */
  authToken?: string
}

function getHelperName(operationType: ConvexOperationType): ServerConvexHelperName {
  if (operationType === 'query') return 'serverConvexQuery'
  if (operationType === 'mutation') return 'serverConvexMutation'
  return 'serverConvexAction'
}

function toServerConvexError(
  error: unknown,
  context: ServerConvexErrorContext,
  phase: 'auth' | 'request',
): ConvexCallError {
  const base = toConvexError(error)
  const prefix =
    phase === 'auth'
      ? `Failed to resolve auth for ${context.functionPath} (auth: ${context.authMode}).`
      : `Request failed for ${context.functionPath} via ${context.convexUrl}/api/${context.operation}.`
  return new ConvexCallError(`[${context.helper}] ${prefix} ${base.message}`, {
    ...context,
    cause: base,
  })
}

function createServerConvexError(message: string, context: ServerConvexErrorContext): ConvexCallError {
  return new ConvexCallError(`[${context.helper}] ${message}`, context)
}

async function resolveAuthToken(
  event: H3Event,
  options: ServerConvexOptions | undefined,
): Promise<string | undefined> {
  const config = normalizeConvexRuntimeConfig(useRuntimeConfig().public.convex)
  return await resolveRequestAuthToken(event, config, options)
}

async function executeConvexOperation<T>(
  event: H3Event,
  operationType: ConvexOperationType,
  functionPath: string,
  args: Record<string, unknown> | undefined,
  options?: ServerConvexOptions,
): Promise<T> {
  const runtimeConfig = useRuntimeConfig()
  const convexConfig = normalizeConvexRuntimeConfig(runtimeConfig.public.convex)
  const convexUrl = convexConfig.url
  const authMode = options?.auth ?? 'auto'
  const errorContext: ServerConvexErrorContext = {
    helper: getHelperName(operationType),
    operation: operationType,
    functionPath,
    convexUrl,
    authMode,
  }

  if (!convexUrl) {
    throw createServerConvexError(
      `Convex URL not configured for ${functionPath}. Set \`convex.url\` in \`nuxt.config.ts\` or provide \`CONVEX_URL\` / \`NUXT_PUBLIC_CONVEX_URL\`.`,
      errorContext,
    )
  }

  const logLevel = getLogLevel(runtimeConfig.public.convex ?? {})
  const logger = createLogger(logLevel)
  const startTime = Date.now()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

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

  let authToken: string | undefined
  try {
    authToken = await resolveAuthToken(event, options)
  } catch (error) {
    const err = toServerConvexError(error, errorContext, 'auth')
    const duration = Date.now() - startTime
    logError(err, duration)
    throw err
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
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

    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('application/json')) {
      const err = new Error(
        `Unexpected response type: ${contentType}. Expected JSON from ${convexUrl}/api/${operationType}.`,
      )
      ;(err as Error & { status?: number }).status = response.status
      throw err
    }

    const json = await response.json()
    const result = parseConvexResponse<T>(json)

    const duration = Date.now() - startTime
    logSuccess(duration)

    return result
  } catch (error) {
    const err = toServerConvexError(error, errorContext, 'request')
    const duration = Date.now() - startTime
    logError(err, duration)
    throw err
  }
}

function resolveServerEvent(
  event: H3Event | undefined,
  helper: ServerConvexHelperName,
  operation: ConvexOperationType,
  functionPath: string,
): H3Event {
  if (event) return event
  try {
    const currentEvent = useRequestEvent()
    if (currentEvent) return currentEvent
  } catch (resolveError) {
    // useRequestEvent() can throw when called outside a Nitro request context.
    // Preserve the original error as cause for debugging unexpected failures.
    throw new ConvexCallError(
      `[${helper}] No H3 event available for ${functionPath}. Pass the event explicitly or call this helper inside a Nitro request context.`,
      { helper, operation, functionPath, authMode: 'auto', cause: resolveError },
    )
  }

  throw new ConvexCallError(
    `[${helper}] No H3 event available for ${functionPath}. Pass the event explicitly or call this helper inside a Nitro request context.`,
    { helper, operation, functionPath, authMode: 'auto' },
  )
}

function isH3EventLike(value: unknown): value is H3Event {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  // H3Event has __is_event__ marker. Fall back to node.req+node.res for mocks.
  return (
    '__is_event__' in record ||
    (typeof record.node === 'object' &&
      record.node !== null &&
      'req' in (record.node as Record<string, unknown>) &&
      'res' in (record.node as Record<string, unknown>))
  )
}

function parseServerConvexArgs<Fn extends FunctionReference<'query' | 'mutation' | 'action'>>(
  operationType: ConvexOperationType,
  input: [H3Event | Fn, Fn | FunctionArgs<Fn> | undefined, FunctionArgs<Fn> | ServerConvexOptions | undefined, ServerConvexOptions | undefined],
): {
  event: H3Event
  fn: Fn
  args: FunctionArgs<Fn> | undefined
  options: ServerConvexOptions | undefined
} {
  const [first, second, third, fourth] = input
  const helper = getHelperName(operationType)

  if (isH3EventLike(first)) {
    return {
      event: first,
      fn: second as Fn,
      args: third as FunctionArgs<Fn> | undefined,
      options: fourth,
    }
  }

  const fn = first as Fn
  const functionPath = getFunctionName(fn)
  return {
    event: resolveServerEvent(undefined, helper, operationType, functionPath),
    fn,
    args: second as FunctionArgs<Fn> | undefined,
    options: third as ServerConvexOptions | undefined,
  }
}

export async function serverConvexQuery<Query extends FunctionReference<'query'>>(
  eventOrQuery: H3Event | Query,
  queryOrArgs?: Query | FunctionArgs<Query>,
  args?: FunctionArgs<Query>,
  options?: ServerConvexOptions,
): Promise<FunctionReturnType<Query>> {
  const parsed = parseServerConvexArgs<Query>('query', [
    eventOrQuery,
    queryOrArgs as Query | FunctionArgs<Query> | undefined,
    args,
    options,
  ])
  const functionPath = getFunctionName(parsed.fn)
  return await executeConvexOperation<FunctionReturnType<Query>>(
    parsed.event,
    'query',
    functionPath,
    parsed.args as Record<string, unknown> | undefined,
    parsed.options,
  )
}

export async function serverConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  eventOrMutation: H3Event | Mutation,
  mutationOrArgs?: Mutation | FunctionArgs<Mutation>,
  args?: FunctionArgs<Mutation>,
  options?: ServerConvexOptions,
): Promise<FunctionReturnType<Mutation>> {
  const parsed = parseServerConvexArgs<Mutation>('mutation', [
    eventOrMutation,
    mutationOrArgs as Mutation | FunctionArgs<Mutation> | undefined,
    args,
    options,
  ])
  const functionPath = getFunctionName(parsed.fn)
  return await executeConvexOperation<FunctionReturnType<Mutation>>(
    parsed.event,
    'mutation',
    functionPath,
    parsed.args as Record<string, unknown> | undefined,
    parsed.options,
  )
}

export async function serverConvexAction<Action extends FunctionReference<'action'>>(
  eventOrAction: H3Event | Action,
  actionOrArgs?: Action | FunctionArgs<Action>,
  args?: FunctionArgs<Action>,
  options?: ServerConvexOptions,
): Promise<FunctionReturnType<Action>> {
  const parsed = parseServerConvexArgs<Action>('action', [
    eventOrAction,
    actionOrArgs as Action | FunctionArgs<Action> | undefined,
    args,
    options,
  ])
  const functionPath = getFunctionName(parsed.fn)
  return await executeConvexOperation<FunctionReturnType<Action>>(
    parsed.event,
    'action',
    functionPath,
    parsed.args as Record<string, unknown> | undefined,
    parsed.options,
  )
}
