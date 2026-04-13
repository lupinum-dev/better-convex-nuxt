import type { PropertyValidators } from 'convex/values'

import {
  createTrustedCallerContextDelta,
  extractTrustedCallerFromArgs,
  isTrustedCallerContextCarrier,
  trustedCallerContextKey,
  trustedCallerValidators,
  type TrustedCallerIdentity,
} from './shared.js'
import { verifyTrustedCallerKey as verifyTrustedCallerKeyInternal } from './shared.js'

export function withTrustedCaller<V extends PropertyValidators>(args: V): V {
  return {
    ...args,
    ...trustedCallerValidators,
  } as V
}

export function setTrustedCallerContext(
  ctx: unknown,
  args: unknown,
  expectedKeyOverride?: string,
): void {
  if (!isTrustedCallerContextCarrier(ctx)) return
  const trustedCaller = extractTrustedCallerFromArgs(args, expectedKeyOverride)
  ctx[trustedCallerContextKey] =
    createTrustedCallerContextDelta(trustedCaller)[trustedCallerContextKey]
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

  return extractTrustedCallerFromArgs(args)
}

export function withTrustedCallerHandler<Args, Return>(
  handler: (ctx: unknown, args: Args) => Promise<Return>,
  expectedKeyOverride?: string,
): (ctx: unknown, args: Args) => Promise<Return> {
  return async (ctx, args) => {
    setTrustedCallerContext(ctx, args, expectedKeyOverride)
    try {
      return await handler(ctx, args)
    } finally {
      clearTrustedCallerContext(ctx)
    }
  }
}

export function verifyTrustedCallerKey(provided: string, expected: string): boolean {
  return verifyTrustedCallerKeyInternal(provided, expected)
}
