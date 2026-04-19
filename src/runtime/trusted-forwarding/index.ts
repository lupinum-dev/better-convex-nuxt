import type { PropertyValidators } from 'convex/values'

import { deny } from '../auth/index.js'
import type { Delegation } from '../functions/define-delegation.js'
import type { Subject } from '../functions/define-principal.js'
import {
  assertForwardableDelegation,
  assertForwardablePrincipal,
  createTrustedForwardingContextDelta,
  extractTrustedForwardingFromArgs,
  isTrustedForwardingContextCarrier,
  trustedForwardingContextKey,
  trustedForwardingValidators,
  type TrustedForwardingIdentity,
} from './shared.js'
import { verifyTrustedForwardingKey as verifyTrustedForwardingKeyInternal } from './shared.js'

/** Add trusted-forwarding transport fields to a Convex args validator. Advanced use only. */
export function withTrustedForwarding<V extends PropertyValidators>(args: V): V {
  return {
    ...args,
    ...trustedForwardingValidators,
  } as V
}

/** Extract and attach the trusted forwarding state onto a context carrier at the transport edge. */
export function setTrustedForwardingContext(
  ctx: unknown,
  args: unknown,
  expectedKeyOverride?: string,
): void {
  if (!isTrustedForwardingContextCarrier(ctx)) return
  const trustedForwarding = extractTrustedForwardingFromArgs(args, expectedKeyOverride)
  ctx[trustedForwardingContextKey] =
    createTrustedForwardingContextDelta(trustedForwarding)[trustedForwardingContextKey]
}

/** Clear previously attached trusted forwarding state from the context carrier. */
export function clearTrustedForwardingContext(ctx: unknown): void {
  if (!isTrustedForwardingContextCarrier(ctx)) return
  ctx[trustedForwardingContextKey] = undefined
}

/** Read the trusted forwarding state from args or an already-populated context carrier. */
export function getTrustedForwarding(args?: unknown): TrustedForwardingIdentity | null {
  if (args === undefined) {
    return null
  }

  if (isTrustedForwardingContextCarrier(args) && trustedForwardingContextKey in args) {
    return (args[trustedForwardingContextKey] as TrustedForwardingIdentity | null | undefined) ?? null
  }

  return extractTrustedForwardingFromArgs(args)
}

/**
 * Read a forwarded business principal from public args, but only when the
 * request already carries verified trusted-forwarding state.
 */
export function getForwardedPrincipal<TPrincipal extends { subject: Subject }>(
  ctx: unknown,
  args: unknown,
  field = 'principal',
): TPrincipal | undefined {
  if (typeof args !== 'object' || args === null || !(field in (args as Record<string, unknown>))) {
    return undefined
  }

  const trustedForwarding = getTrustedForwarding(ctx)
  if (!trustedForwarding) {
    throw deny(`Forwarded \`${field}\` is only allowed on verified trusted forwarding paths.`, {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  const principal = (args as Record<string, unknown>)[field]
  assertForwardablePrincipal(principal, trustedForwarding)
  return principal as TPrincipal
}

/**
 * Read a forwarded delegation target from public args, but only when the
 * request already carries verified trusted-forwarding state.
 */
export function getForwardedDelegation<TDelegation extends Delegation>(
  ctx: unknown,
  args: unknown,
  field = 'delegation',
): TDelegation | undefined {
  if (typeof args !== 'object' || args === null || !(field in (args as Record<string, unknown>))) {
    return undefined
  }

  const trustedForwarding = getTrustedForwarding(ctx)
  if (!trustedForwarding) {
    throw deny(`Forwarded \`${field}\` is only allowed on verified trusted forwarding paths.`, {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  const delegation = (args as Record<string, unknown>)[field]
  assertForwardableDelegation(delegation, trustedForwarding)
  return delegation as TDelegation
}

/** Compare a provided trusted-forwarding key with the expected shared secret. */
export function verifyTrustedForwardingKey(provided: string, expected: string): boolean {
  return verifyTrustedForwardingKeyInternal(provided, expected)
}
