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

interface PrivateConvexErrorContext {
  helper: PrivateHelperName
  source: 'privileged'
  operation: PrivateOperationType
  functionPath: string
  convexUrl?: string
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

function getPrivateBridgeKey(context: PrivateConvexErrorContext): string {
  const apiKey = process.env.CONVEX_PRIVATE_BRIDGE_KEY?.trim()
  if (apiKey) {
    return apiKey
  }
  throw createPrivateConvexError(
    'Missing server-only `CONVEX_PRIVATE_BRIDGE_KEY`. Configure it in the app runtime, not `runtimeConfig.public`.',
    context,
  )
}

function getConvexUrl(context: PrivateConvexErrorContext): string {
  const runtimeConfig = useRuntimeConfig()
  const convexUrl = runtimeConfig.public.convex?.url
  if (typeof convexUrl === 'string' && convexUrl.length > 0) {
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
    const response = await fetch(`${convexUrl}/api/${operation}`, {
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
    throw createPrivateConvexError(
      `Privileged ${operation} failed for ${functionPath} via ${convexUrl}. ${error instanceof Error ? error.message : String(error)}`,
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
