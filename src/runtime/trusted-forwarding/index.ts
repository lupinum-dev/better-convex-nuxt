import type { PropertyValidators } from 'convex/values'

import { deny } from '../auth/index.js'
import type { Delegation } from '../functions/define-delegation.js'
import type { Subject } from '../functions/define-principal.js'
import {
  assertForwardableDelegation,
  assertForwardablePrincipal,
  createTrustedForwardingContextDelta,
  extractTrustedForwardingFromArgs,
  getTrustedForwardingPayload,
  isTrustedForwardingContextCarrier,
  trustedForwardingContextKey,
  trustedForwardingValidators,
  type TrustedForwardingEnvelopeContextOptions,
  type TrustedForwardingIdentity,
} from './shared.js'

export {
  canonicalizeForwardingArgs,
  createTrustedForwardingEnvelope,
  hashForwardingArgs,
  TrustedForwardingEnvelopeError,
  verifyTrustedForwardingEnvelope,
} from './envelope.js'
export { type TrustedForwardingEnvelopeContextOptions } from './shared.js'
export { extractSubject, getTrustedForwardingKeyProductionIssue } from './shared.js'
export type {
  CreateTrustedForwardingEnvelopeOptions,
  TrustedForwardingEnvelopePayload,
  TrustedForwardingPurpose,
  TrustedForwardingTransport,
  VerifyTrustedForwardingEnvelopeOptions,
} from './envelope.js'

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
  expectedKeyOverride?: string | TrustedForwardingEnvelopeContextOptions,
): void {
  if (!isTrustedForwardingContextCarrier(ctx)) return
  const trustedForwarding = extractTrustedForwardingFromArgs(args, expectedKeyOverride)
  Object.assign(ctx, createTrustedForwardingContextDelta(trustedForwarding, args))
}

/** Clear previously attached trusted forwarding state from the context carrier. */
export function clearTrustedForwardingContext(ctx: unknown): void {
  if (!isTrustedForwardingContextCarrier(ctx)) return
  Object.assign(ctx, createTrustedForwardingContextDelta(null))
}

/** Read the trusted forwarding state from args or an already-populated context carrier. */
export function getTrustedForwarding(args?: unknown): TrustedForwardingIdentity | null {
  if (args === undefined) {
    return null
  }

  if (isTrustedForwardingContextCarrier(args) && trustedForwardingContextKey in args) {
    return (
      (args[trustedForwardingContextKey] as TrustedForwardingIdentity | null | undefined) ?? null
    )
  }

  return extractTrustedForwardingFromArgs(args)
}

/**
 * Read a forwarded business principal from public args, but only when the
 * request already carries verified trusted-forwarding state.
 */
export function getForwardedPrincipal<TPrincipal extends { subject: Subject }>(
  ctx: unknown,
  args?: unknown,
  field = 'principal',
): TPrincipal | undefined {
  const storedPayload = getTrustedForwardingPayload(ctx)
  const principal =
    field === 'principal' && storedPayload?.principal !== undefined
      ? storedPayload.principal
      : typeof args === 'object' && args !== null && field in (args as Record<string, unknown>)
        ? (args as Record<string, unknown>)[field]
        : undefined
  if (principal === undefined) return undefined

  const trustedForwarding = getTrustedForwarding(ctx)
  if (!trustedForwarding) {
    throw deny(`Forwarded \`${field}\` is only allowed on verified trusted forwarding paths.`, {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  assertForwardablePrincipal(principal, trustedForwarding)
  return principal as TPrincipal
}

/**
 * Read a forwarded delegation target from public args, but only when the
 * request already carries verified trusted-forwarding state.
 */
export function getForwardedDelegation<TDelegation extends Delegation>(
  ctx: unknown,
  args?: unknown,
  field = 'delegation',
): TDelegation | null {
  const storedPayload = getTrustedForwardingPayload(ctx)
  const delegation =
    field === 'delegation' && storedPayload?.delegation !== undefined
      ? storedPayload.delegation
      : typeof args === 'object' && args !== null && field in (args as Record<string, unknown>)
        ? (args as Record<string, unknown>)[field]
        : undefined
  if (delegation === undefined) return null

  const trustedForwarding = getTrustedForwarding(ctx)
  if (!trustedForwarding) {
    throw deny(`Forwarded \`${field}\` is only allowed on verified trusted forwarding paths.`, {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  assertForwardableDelegation(delegation, trustedForwarding)
  return delegation as TDelegation
}
