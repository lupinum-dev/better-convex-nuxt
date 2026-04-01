import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

import { deny } from '../auth'

export type TrustedCallerIdentity = {
  userId: string
}

const trustedCallerContextKey = Symbol('better-convex-nuxt.trustedCaller')

const trustedCallerValidators = {
  _trustedCallerKey: v.optional(v.string()),
  _trustedCaller: v.optional(
    v.object({
      userId: v.string(),
    }),
  ),
} satisfies PropertyValidators

type TrustedCallerInput = {
  _trustedCallerKey?: unknown
  _trustedCaller?: {
    userId?: unknown
  } | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function withTrustedCaller<V extends PropertyValidators>(args: V): V {
  return {
    ...args,
    ...trustedCallerValidators,
  } as V
}

function extractFromArgs(args: unknown): TrustedCallerIdentity | null {
  if (!isObject(args)) return null

  const input = args as TrustedCallerInput
  const hasTransport = input._trustedCallerKey !== undefined || input._trustedCaller !== undefined
  if (!hasTransport) return null

  if (
    typeof input._trustedCallerKey !== 'string' ||
    !isObject(input._trustedCaller) ||
    typeof input._trustedCaller.userId !== 'string'
  ) {
    throw deny('Malformed trusted caller payload.', {
      source: 'trusted-caller',
      category: 'auth',
    })
  }

  const expectedKey = process.env.CONVEX_TRUSTED_CALLER_KEY?.trim()
  if (!expectedKey) {
    throw deny('Trusted caller auth is not configured. Set CONVEX_TRUSTED_CALLER_KEY.', {
      source: 'trusted-caller',
      category: 'auth',
    })
  }

  if (!verifyTrustedCallerKey(input._trustedCallerKey, expectedKey)) {
    throw deny('Invalid trusted caller credentials.', {
      source: 'trusted-caller',
      category: 'auth',
    })
  }

  return {
    userId: input._trustedCaller.userId,
  }
}

type TrustedCallerContextCarrier = Record<PropertyKey, unknown> & {
  [trustedCallerContextKey]?: TrustedCallerIdentity | null
}

function isTrustedCallerContextCarrier(value: unknown): value is TrustedCallerContextCarrier {
  return isObject(value)
}

export function setTrustedCallerContext(ctx: unknown, args: unknown): void {
  if (!isTrustedCallerContextCarrier(ctx)) return
  ctx[trustedCallerContextKey] = extractFromArgs(args)
}

export function clearTrustedCallerContext(ctx: unknown): void {
  if (!isTrustedCallerContextCarrier(ctx)) return
  ctx[trustedCallerContextKey] = undefined
}

export function getTrustedCaller(args?: unknown): TrustedCallerIdentity | null {
  if (args === undefined) {
    return null
  }

  if (isTrustedCallerContextCarrier(args) && trustedCallerContextKey in args) {
    return (args[trustedCallerContextKey] as TrustedCallerIdentity | null | undefined) ?? null
  }

  return extractFromArgs(args)
}

export function withTrustedCallerHandler<Args, Return>(
  handler: (ctx: unknown, args: Args) => Promise<Return>,
): (ctx: unknown, args: Args) => Promise<Return> {
  return async (ctx, args) => {
    setTrustedCallerContext(ctx, args)
    try {
      return await handler(ctx, args)
    } finally {
      clearTrustedCallerContext(ctx)
    }
  }
}

export function verifyTrustedCallerKey(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  let mismatch = provided.length === expected.length ? 0 : 1
  const maxLength = Math.max(provided.length, expected.length)

  for (let index = 0; index < maxLength; index++) {
    const left = provided.charCodeAt(index) || 0
    const right = expected.charCodeAt(index) || 0
    mismatch |= left ^ right
  }

  return mismatch === 0
}
