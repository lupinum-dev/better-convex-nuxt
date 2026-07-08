import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import type { H3Event } from 'h3'

import { useRuntimeConfig } from '#imports'

import type { ConvexQueryRest } from '../../utils/args-tuple'
import { normalizeConvexError, toError } from '../../utils/call-result'
import { parseConvexResponse, getFunctionName } from '../../utils/convex-shared'
import { createLogger, getLogLevel } from '../../utils/logger'
import { normalizeConvexRuntimeConfig } from '../../utils/runtime-config'
import { filterBetterAuthCookies, getBetterAuthSessionToken } from '../../utils/shared-helpers'
import type { ConvexServerAuthMode } from '../../utils/types'
import { getCachedAuthToken, setCachedAuthToken } from './auth-cache'

type ConvexOperationType = 'query' | 'mutation' | 'action'

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

function getCookieHeader(event: H3Event): string {
  const directHeader = (event as { headers?: { get?: (name: string) => string | null } }).headers
  if (directHeader?.get) {
    return directHeader.get('cookie') ?? ''
  }

  const nodeHeaders = (
    event as { node?: { req?: { headers?: Record<string, string | string[] | undefined> } } }
  ).node?.req?.headers
  const raw = nodeHeaders?.cookie
  if (Array.isArray(raw)) return raw.join('; ')
  return typeof raw === 'string' ? raw : ''
}

async function resolveAuthToken(
  event: H3Event,
  options: ServerConvexOptions | undefined,
): Promise<string | undefined> {
  if (options?.authToken) {
    return options.authToken
  }

  const policy = options?.auth ?? 'auto'
  if (policy === 'none') {
    return undefined
  }

  const config = normalizeConvexRuntimeConfig(useRuntimeConfig().public.convex)
  const cookieHeader = getCookieHeader(event)
  const sessionToken = getBetterAuthSessionToken(cookieHeader)
  const authCookieHeader = filterBetterAuthCookies(cookieHeader)

  if (!authCookieHeader || !sessionToken) {
    if (policy === 'required') {
      throw new Error(
        '[serverConvex] Authentication required but no Better Auth session cookie was found',
      )
    }
    return undefined
  }

  if (!config.siteUrl) {
    if (policy === 'required') {
      throw new Error('[serverConvex] Authentication required but convex.siteUrl is not configured')
    }
    return undefined
  }

  try {
    if (config.authCache.enabled && sessionToken) {
      const cached = await getCachedAuthToken(sessionToken)
      if (cached) {
        return cached
      }
    }

    const response = (await $fetch(`${config.siteUrl}/api/auth/convex/token`, {
      headers: {
        Cookie: authCookieHeader,
      },
    })) as { token?: string } | null

    if (response?.token) {
      if (config.authCache.enabled && sessionToken) {
        await setCachedAuthToken(sessionToken, response.token, config.authCache.ttl)
      }
      return response.token
    }
  } catch (error) {
    if (policy === 'required') {
      throw error instanceof Error
        ? error
        : new Error('[serverConvex] Failed to resolve auth token')
    }
    return undefined
  }

  if (policy === 'required') {
    throw new Error('[serverConvex] Authentication required but token exchange returned no token')
  }

  return undefined
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

  if (!convexUrl) {
    throw new Error('[serverConvex] Convex URL not configured')
  }

  const logLevel = getLogLevel(runtimeConfig.public.convex ?? {})
  const logger = createLogger(logLevel)
  const startTime = Date.now()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const authToken = await resolveAuthToken(event, options)
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
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
      const text = await response.text()
      const err = new Error(`Unexpected response type: ${contentType}. Body: ${text.slice(0, 200)}`)
      ;(err as Error & { status?: number }).status = response.status
      throw err
    }

    const json = await response.json()
    const result = parseConvexResponse<T>(json)

    const duration = Date.now() - startTime
    logSuccess(duration)

    return result
  } catch (error) {
    const normalized = normalizeConvexError(error)
    const err = toError(normalized)
    const duration = Date.now() - startTime
    logError(err, duration)
    throw err
  }
}

export async function serverConvexQuery<Query extends FunctionReference<'query'>>(
  event: H3Event,
  query: Query,
  ...rest: ConvexQueryRest<FunctionArgs<Query>, FunctionArgs<Query>, ServerConvexOptions>
): Promise<FunctionReturnType<Query>> {
  const [args, options] = rest
  const functionPath = getFunctionName(query)
  return await executeConvexOperation<FunctionReturnType<Query>>(
    event,
    'query',
    functionPath,
    args as Record<string, unknown> | undefined,
    options,
  )
}

export async function serverConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  event: H3Event,
  mutation: Mutation,
  ...rest: ConvexQueryRest<FunctionArgs<Mutation>, FunctionArgs<Mutation>, ServerConvexOptions>
): Promise<FunctionReturnType<Mutation>> {
  const [args, options] = rest
  const functionPath = getFunctionName(mutation)
  return await executeConvexOperation<FunctionReturnType<Mutation>>(
    event,
    'mutation',
    functionPath,
    args as Record<string, unknown> | undefined,
    options,
  )
}

export async function serverConvexAction<Action extends FunctionReference<'action'>>(
  event: H3Event,
  action: Action,
  ...rest: ConvexQueryRest<FunctionArgs<Action>, FunctionArgs<Action>, ServerConvexOptions>
): Promise<FunctionReturnType<Action>> {
  const [args, options] = rest
  const functionPath = getFunctionName(action)
  return await executeConvexOperation<FunctionReturnType<Action>>(
    event,
    'action',
    functionPath,
    args as Record<string, unknown> | undefined,
    options,
  )
}
