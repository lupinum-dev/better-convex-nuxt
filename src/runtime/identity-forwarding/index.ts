import type { PropertyValidators } from 'convex/values'

import { deny } from '../auth/index.js'
import type { ActingFor } from '../functions/define-acting-for.js'
import type { Subject } from '../functions/define-caller.js'
import {
  assertForwardableActingFor,
  assertForwardableCaller,
  createIdentityForwardingContextDelta,
  extractIdentityForwardingFromArgs,
  getIdentityForwardingPayload,
  isIdentityForwardingContextCarrier,
  identityForwardingContextKey,
  identityForwardingValidators,
  type IdentityForwardingEnvelopeContextOptions,
  type IdentityForwardingIdentity,
  type IdentityForwardingKeyInput,
} from './shared.js'

export {
  canonicalizeForwardingArgs,
  createIdentityForwardingEnvelope,
  hashForwardingArgs,
  IdentityForwardingEnvelopeError,
  verifyIdentityForwardingEnvelope,
} from './envelope.js'
export {
  type IdentityForwardingEnvelopeContextOptions,
  type IdentityForwardingKeyInput,
} from './shared.js'
export {
  createIdentityForwardingEnvelopeArgs,
  extractSubject,
  getIdentityForwardingKeyProductionIssue,
} from './shared.js'
export type {
  CreateIdentityForwardingEnvelopeOptions,
  IdentityForwardingEnvelopePayload,
  IdentityForwardingPurpose,
  IdentityForwardingTransport,
  VerifyIdentityForwardingEnvelopeOptions,
} from './envelope.js'

/** Add identity-forwarding transport fields to a Convex args validator. Advanced use only. */
export function withIdentityForwarding<V extends PropertyValidators>(args: V): V {
  return {
    ...args,
    ...identityForwardingValidators,
  } as V
}

/** Extract and attach the identity forwarding state onto a context carrier at the transport edge. */
export function setIdentityForwardingContext(
  ctx: unknown,
  args: unknown,
  expectedKeyOverride?: IdentityForwardingKeyInput | IdentityForwardingEnvelopeContextOptions,
): void {
  if (!isIdentityForwardingContextCarrier(ctx)) return
  const identityForwarding = extractIdentityForwardingFromArgs(args, expectedKeyOverride)
  Object.assign(ctx, createIdentityForwardingContextDelta(identityForwarding, args))
}

/** Clear previously attached identity forwarding state from the context carrier. */
export function clearIdentityForwardingContext(ctx: unknown): void {
  if (!isIdentityForwardingContextCarrier(ctx)) return
  Object.assign(ctx, createIdentityForwardingContextDelta(null))
}

/** Read the identity forwarding state from args or an already-populated context carrier. */
export function getIdentityForwarding(args?: unknown): IdentityForwardingIdentity | null {
  if (args === undefined) {
    return null
  }

  if (isIdentityForwardingContextCarrier(args) && identityForwardingContextKey in args) {
    return (
      (args[identityForwardingContextKey] as IdentityForwardingIdentity | null | undefined) ?? null
    )
  }

  return extractIdentityForwardingFromArgs(args)
}

/**
 * Read a forwarded business caller from public args, but only when the
 * request already carries verified identity-forwarding state.
 */
export function getForwardedCaller<TCaller extends { subject: Subject }>(
  ctx: unknown,
  args?: unknown,
  field = 'caller',
): TCaller | undefined {
  const storedPayload = getIdentityForwardingPayload(ctx)
  const caller =
    field === 'caller' && storedPayload?.caller !== undefined
      ? storedPayload.caller
      : typeof args === 'object' && args !== null && field in (args as Record<string, unknown>)
        ? (args as Record<string, unknown>)[field]
        : undefined
  if (caller === undefined) return undefined

  const identityForwarding = getIdentityForwarding(ctx)
  if (!identityForwarding) {
    throw deny(`Forwarded \`${field}\` is only allowed on verified identity forwarding paths.`, {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  assertForwardableCaller(caller, identityForwarding)
  return caller as TCaller
}

/**
 * Read a forwarded actingFor target from public args, but only when the
 * request already carries verified identity-forwarding state.
 */
export function getForwardedActingFor<TActingFor extends ActingFor>(
  ctx: unknown,
  args?: unknown,
  field = 'actingFor',
): TActingFor | null {
  const storedPayload = getIdentityForwardingPayload(ctx)
  const actingFor =
    field === 'actingFor' && storedPayload?.actingFor !== undefined
      ? storedPayload.actingFor
      : typeof args === 'object' && args !== null && field in (args as Record<string, unknown>)
        ? (args as Record<string, unknown>)[field]
        : undefined
  if (actingFor === undefined) return null

  const identityForwarding = getIdentityForwarding(ctx)
  if (!identityForwarding) {
    throw deny(`Forwarded \`${field}\` is only allowed on verified identity forwarding paths.`, {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  assertForwardableActingFor(actingFor, identityForwarding)
  return actingFor as TActingFor
}
