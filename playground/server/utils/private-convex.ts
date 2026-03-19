import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from 'convex/server'

import { useRuntimeConfig } from '#imports'

import { parseConvexResponse } from '../../../src/runtime/utils/convex-shared'

type PrivateOperationType = 'query' | 'mutation' | 'action'
type PrivateHelperName = 'privateConvexQuery' | 'privateConvexMutation' | 'privateConvexAction'
const PRIVATE_CONVEX_FETCH_TIMEOUT_MS = 5_000

interface PrivateConvexErrorContext {
  helper: PrivateHelperName
  source: 'privileged'
  operation: PrivateOperationType
  functionPath: string
  convexUrl?: string
}

export interface PrivateBridgeReferenceState {
  demoEnabled: boolean
  hasServerBridgeKey: boolean
  hasConvexUrl: boolean
  isConfigured: boolean
  message: string
}

function getHelperName(operation: PrivateOperationType): PrivateHelperName {
  if (operation === 'query') return 'privateConvexQuery'
  if (operation === 'mutation') return 'privateConvexMutation'
  return 'privateConvexAction'
}

function createPrivateConvexError(
  message: string,
  context: PrivateConvexErrorContext,
  cause?: unknown,
): Error {
  const err = new Error(`[${context.helper}] ${message}`)
  Object.assign(err, context, { cause })
  return err
}

function isPrivateBridgeDemoEnabled(): boolean {
  return process.env.PLAYGROUND_ENABLE_PRIVATE_BRIDGE_REFERENCE === 'true'
}

function getConfiguredPrivateBridgeKey(): string | undefined {
  const apiKey = process.env.CONVEX_PRIVATE_BRIDGE_KEY?.trim()
  return apiKey || undefined
}

function getConfiguredConvexUrl(): string | undefined {
  const runtimeConfig = useRuntimeConfig()
  const convexUrl = runtimeConfig.public.convex?.url
  return typeof convexUrl === 'string' && convexUrl.length > 0 ? convexUrl : undefined
}

export function getPrivateBridgeReferenceState(): PrivateBridgeReferenceState {
  const demoEnabled = isPrivateBridgeDemoEnabled()
  const hasServerBridgeKey = Boolean(getConfiguredPrivateBridgeKey())
  const hasConvexUrl = Boolean(getConfiguredConvexUrl())
  const isConfigured = demoEnabled && hasServerBridgeKey && hasConvexUrl

  if (!demoEnabled) {
    return {
      demoEnabled,
      hasServerBridgeKey,
      hasConvexUrl,
      isConfigured,
      message:
        'Privileged reference lane is disabled by default. Use `pnpm dev:local` or set `PLAYGROUND_ENABLE_PRIVATE_BRIDGE_REFERENCE=true` and matching bridge keys on both the Nuxt server and Convex backend.',
    }
  }

  if (!hasServerBridgeKey) {
    return {
      demoEnabled,
      hasServerBridgeKey,
      hasConvexUrl,
      isConfigured,
      message:
        'Privileged reference lane is enabled, but the Nuxt server is missing `CONVEX_PRIVATE_BRIDGE_KEY`.',
    }
  }

  if (!hasConvexUrl) {
    return {
      demoEnabled,
      hasServerBridgeKey,
      hasConvexUrl,
      isConfigured,
      message: 'Privileged reference lane is enabled, but `convex.url` is not configured.',
    }
  }

  return {
    demoEnabled,
    hasServerBridgeKey,
    hasConvexUrl,
    isConfigured,
    message:
      'Privileged reference lane is configured. The example route injects a server-only bridge key before calling Convex.',
  }
}

function getPrivateBridgeKey(context: PrivateConvexErrorContext): string {
  const apiKey = getConfiguredPrivateBridgeKey()
  if (apiKey) {
    return apiKey
  }
  throw createPrivateConvexError(
    'Missing server-only `CONVEX_PRIVATE_BRIDGE_KEY`. Configure it in the app runtime, not `runtimeConfig.public`.',
    context,
  )
}

function getConvexUrl(context: PrivateConvexErrorContext): string {
  const convexUrl = getConfiguredConvexUrl()
  if (convexUrl) {
    return convexUrl
  }
  throw createPrivateConvexError(
    'Convex URL not configured. Set `convex.url` in `nuxt.config.ts` or provide `CONVEX_URL` / `NUXT_PUBLIC_CONVEX_URL`.',
    context,
  )
}

function withBridgeKey(
  args: Record<string, unknown> | undefined,
  apiKey: string,
): Record<string, unknown> {
  return { ...(args ?? {}), apiKey }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${PRIVATE_CONVEX_FETCH_TIMEOUT_MS}ms`))
  }, PRIVATE_CONVEX_FETCH_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw controller.signal.reason ?? error
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function executePrivateConvexOperation<
  Operation extends PrivateOperationType,
  Func extends FunctionReference<Operation>,
>(
  operation: Operation,
  func: Func,
  args?: FunctionArgs<Func>,
): Promise<FunctionReturnType<Func>> {
  const functionPath = getFunctionName(func)
  const helper = getHelperName(operation)
  const initialContext: PrivateConvexErrorContext = {
    helper,
    source: 'privileged',
    operation,
    functionPath,
  }

  const convexUrl = getConvexUrl(initialContext)
  const context: PrivateConvexErrorContext = {
    ...initialContext,
    convexUrl,
  }
  const apiKey = getPrivateBridgeKey(context)
  const argsWithApiKey = withBridgeKey(args as Record<string, unknown> | undefined, apiKey)

  try {
    const response = await fetchWithTimeout(`${convexUrl}/api/${operation}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: functionPath,
        args: argsWithApiKey,
      }),
    })

    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('application/json')) {
      const text = await response.text()
      throw new Error(`Unexpected response type: ${contentType}. Body: ${text.slice(0, 200)}`)
    }

    return parseConvexResponse<FunctionReturnType<Func>>(await response.json())
  } catch (error) {
    const detail =
      error instanceof Error && error.message === 'Invalid API key'
        ? `Convex rejected the server-only \`CONVEX_PRIVATE_BRIDGE_KEY\` for ${functionPath}.`
        : error instanceof Error
          ? error.message
          : String(error)
    throw createPrivateConvexError(
      `Privileged ${operation} failed for ${functionPath} via ${convexUrl}. ${detail}`,
      context,
      error,
    )
  }
}

export async function privateConvexQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args?: FunctionArgs<Query>,
): Promise<FunctionReturnType<Query>> {
  return await executePrivateConvexOperation('query', query, args)
}

export async function privateConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  args?: FunctionArgs<Mutation>,
): Promise<FunctionReturnType<Mutation>> {
  return await executePrivateConvexOperation('mutation', mutation, args)
}

export async function privateConvexAction<Action extends FunctionReference<'action'>>(
  action: Action,
  args?: FunctionArgs<Action>,
): Promise<FunctionReturnType<Action>> {
  return await executePrivateConvexOperation('action', action, args)
}
