import type { PropertyValidators } from 'convex/values'

import { deny } from '../auth/index.js'
import {
  createTrustedCallerContextDelta,
  extractTrustedCallerFromArgs,
  isTrustedCallerContextCarrier,
  trustedCallerContextKey,
  trustedCallerValidators,
  type TrustedCallerIdentity,
} from './shared.js'
import { verifyTrustedCallerKey as verifyTrustedCallerKeyInternal } from './shared.js'

/** Add trusted-caller transport fields to a Convex args validator. Advanced use only. */
export function withTrustedCaller<V extends PropertyValidators>(args: V): V {
  return {
    ...args,
    ...trustedCallerValidators,
  } as V
}

/** Extract and attach the trusted caller onto a context carrier at the transport edge. */
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

/** Clear a previously attached trusted caller from the context carrier. */
export function clearTrustedCallerContext(ctx: unknown): void {
  if (!isTrustedCallerContextCarrier(ctx)) return
  ctx[trustedCallerContextKey] = undefined
}

/** Read the trusted caller from args or an already-populated context carrier. */
export function getTrustedCaller(args?: unknown): TrustedCallerIdentity | null {
  if (args === undefined) {
    return null
  }

  if (isTrustedCallerContextCarrier(args) && trustedCallerContextKey in args) {
    return (args[trustedCallerContextKey] as TrustedCallerIdentity | null | undefined) ?? null
  }

  return extractTrustedCallerFromArgs(args)
}

/**
 * Read a forwarded business principal from public args, but only when the
 * request already carries verified trusted-caller state.
 */
export function getForwardedPrincipal<TPrincipal>(
  ctx: unknown,
  args: unknown,
  field = 'principal',
): TPrincipal | undefined {
  if (
    typeof args !== 'object' ||
    args === null ||
    !(field in (args as Record<string, unknown>))
  ) {
    return undefined
  }

  if (!getTrustedCaller(ctx)) {
    throw deny(
      `Forwarded \`${field}\` is only allowed on verified trusted caller paths.`,
      {
        source: 'trusted-caller',
        category: 'auth',
      },
    )
  }

  return (args as Record<string, unknown>)[field] as TPrincipal | undefined
}

/** Compare a provided trusted-caller key with the expected shared secret. */
export function verifyTrustedCallerKey(provided: string, expected: string): boolean {
  return verifyTrustedCallerKeyInternal(provided, expected)
}
