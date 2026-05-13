import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

import { deny } from '../auth/index.js'
import { getSubjectKind, getSubjectValue, subject } from '../auth/subject.js'
import type { ActingFor } from '../functions/define-acting-for.js'
import type { Subject } from '../functions/define-caller.js'
import {
  createIdentityForwardingEnvelope,
  identityForwardingPurposeMaxTtlsMs,
  IdentityForwardingEnvelopeError,
  verifyIdentityForwardingEnvelope,
  type IdentityForwardingPurpose,
  type IdentityForwardingTransport,
} from './envelope.js'

export type IdentityForwardingIdentity = {
  principalSubject: Subject
  delegationSubject?: Subject
}

export type IdentityForwardingInput = {
  _trellisForwarding?: unknown
  _trellisForwardingKey?: unknown
}

export type IdentityForwardingContextCarrier = Record<PropertyKey, unknown> & {
  [identityForwardingContextKey]?: IdentityForwardingIdentity | null
  [identityForwardingPayloadContextKey]?: IdentityForwardingPayload | null
  [identityForwardingEnvelopeContextKey]?: IdentityForwardingEnvelopeState | null
}

export const identityForwardingContextKey = Symbol.for('trellis.identityForwarding')
export const identityForwardingPayloadContextKey = Symbol.for('trellis.identityForwardingPayload')
export const identityForwardingEnvelopeContextKey = Symbol.for('trellis.identityForwardingEnvelope')

export type IdentityForwardingPayload = {
  caller?: unknown
  actingFor?: unknown
}

export type IdentityForwardingEnvelopeState = {
  jti: string
  purpose: IdentityForwardingPurpose
  functionRef: string
}

const envelopePayloadByArgs = new WeakMap<object, IdentityForwardingPayload>()
const envelopeStateByArgs = new WeakMap<object, IdentityForwardingEnvelopeState>()

export const identityForwardingValidators = {
  _trellisForwarding: v.optional(v.string()),
} satisfies PropertyValidators

export const identityForwardingAlphaIssuer = 'trellis://server'
export const identityForwardingAlphaAudience = 'trellis://convex'
export const identityForwardingDefaultKeyId = 'default'

export const identityForwardingAlphaTtlsMs = {
  ...identityForwardingPurposeMaxTtlsMs,
} satisfies Record<IdentityForwardingPurpose, number>

export type IdentityForwardingKeyInput = string | ((args?: unknown) => string)

export type IdentityForwardingEnvelopeContextOptions = {
  expectedKeyOverride?: IdentityForwardingKeyInput
  expectedIssuer?: string
  expectedAudience?: string
  expectedFunctionRef?: string
  expectedPurpose?: IdentityForwardingPurpose
  expectedTransport?: IdentityForwardingTransport
  now?: number
  maxEnvelopeBytes?: number
  redeemJti?: (jti: string) => boolean
}

export type CreateIdentityForwardingArgsOptions = {
  args?: Record<string, unknown>
  caller: { subject: Subject } & Record<string, unknown>
  actingFor?: ActingFor
  functionRef: string
  operation: 'query' | 'mutation' | 'action'
  purpose?: IdentityForwardingPurpose
  transport?: IdentityForwardingTransport
  key?: string
  keyId?: string
  issuer?: string
  audience?: string
  jti?: string
  now?: number
  ttlMs?: number
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isIdentityForwardingContextCarrier(
  value: unknown,
): value is IdentityForwardingContextCarrier {
  return isObject(value)
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function getRequiredIdentityForwardingKey(
  override?: IdentityForwardingKeyInput,
  args?: unknown,
): string {
  const overrideValue = typeof override === 'function' ? override(args) : override
  const key =
    nonBlankString(overrideValue) ?? nonBlankString(process.env.CONVEX_IDENTITY_FORWARDING_KEY)

  if (!key) {
    throw deny('Identity forwarding auth is not configured. Set CONVEX_IDENTITY_FORWARDING_KEY.', {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  const keyIssue = getIdentityForwardingKeyProductionIssue(key)
  if (keyIssue) {
    throw deny(keyIssue, {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  return key
}

function toIdentityForwardingDeny(error: unknown): Error {
  if (error instanceof IdentityForwardingEnvelopeError) {
    return deny(`Invalid identity forwarding envelope: ${error.code}.`, {
      source: 'identity-forwarding',
      category: 'auth',
    }) as Error
  }

  if (error instanceof Error) return error

  return deny('Invalid identity forwarding envelope.', {
    source: 'identity-forwarding',
    category: 'auth',
  }) as Error
}

export const minimumIdentityForwardingKeyLength = 32

const obviousDevelopmentKeyPatterns = [
  /replace[-_ ]?me/i,
  /change[-_ ]?me/i,
  /placeholder/i,
  /\bexample\b/i,
  /\b(?:dev|test|local)(?:[-_ ]?(?:key|secret))?\b/i,
  /\btrusted[-_ ]?key\b/i,
  /\bbridge[-_ ]?secret\b/i,
]

export function isWeakIdentityForwardingKey(value: string): boolean {
  return value.trim().length < minimumIdentityForwardingKeyLength
}

export function isObviouslyDevLikeIdentityForwardingKey(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  return obviousDevelopmentKeyPatterns.some((pattern) => pattern.test(trimmed))
}

export function getIdentityForwardingKeyProductionIssue(
  value: string,
  nodeEnv = process.env.NODE_ENV,
): string | null {
  if (nodeEnv !== 'production') return null

  if (isWeakIdentityForwardingKey(value)) {
    return `CONVEX_IDENTITY_FORWARDING_KEY must be at least ${minimumIdentityForwardingKeyLength} characters in production.`
  }

  if (isObviouslyDevLikeIdentityForwardingKey(value)) {
    return 'CONVEX_IDENTITY_FORWARDING_KEY looks like a development or placeholder value. Replace it with a long random shared secret in production.'
  }

  return null
}

function deriveCanonicalSubject(value: unknown): Subject | undefined {
  if (!isObject(value)) return undefined

  const kind = value.kind
  if (kind === 'user') {
    const userId = nonBlankString((value as { userId?: unknown }).userId)
    return userId ? subject.user(userId) : undefined
  }

  if (kind === 'agent') {
    const agentId =
      nonBlankString((value as { agentId?: unknown }).agentId) ??
      nonBlankString((value as { userId?: unknown }).userId)
    return agentId ? subject.agent(agentId) : undefined
  }

  if (kind === 'service') {
    const serviceId = nonBlankString((value as { serviceId?: unknown }).serviceId)
    return serviceId ? subject.service(serviceId) : undefined
  }

  return undefined
}

export function isCanonicalSubject(value: unknown): value is Subject {
  return getSubjectKind(value) !== null && getSubjectValue(value) !== null
}

export function extractSubject(value: unknown): Subject | undefined {
  const hasSubjectField = isObject(value) && 'subject' in value
  const subject = nonBlankString(
    hasSubjectField ? (value as { subject?: unknown }).subject : undefined,
  )
  if (isCanonicalSubject(subject)) {
    const derivedSubject = deriveCanonicalSubject(value)
    if (derivedSubject && derivedSubject !== subject) {
      return undefined
    }
    return subject
  }

  if (hasSubjectField && subject !== undefined) {
    return undefined
  }

  return deriveCanonicalSubject(value)
}

export function isAnonymousCallerLike(value: unknown): boolean {
  return isObject(value) && 'kind' in value && (value as { kind?: unknown }).kind === 'anonymous'
}

export function assertForwardableCaller(
  caller: unknown,
  identityForwarding: IdentityForwardingIdentity,
): Subject {
  if (!isObject(caller) || isAnonymousCallerLike(caller)) {
    throw deny('Forwarded `caller` must be a non-anonymous object with a canonical subject.', {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  const subject = extractSubject(caller)
  if (!subject) {
    throw deny('Forwarded `caller` must include a canonical subject.', {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  if (subject !== identityForwarding.principalSubject) {
    throw deny('Forwarded `caller` subject does not match the identity forwarding subject.', {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  return subject
}

export function assertForwardableActingFor(
  actingFor: unknown,
  identityForwarding: IdentityForwardingIdentity,
): Subject {
  if (!isObject(actingFor)) {
    throw deny('Forwarded `actingFor` must be an object with a canonical subject.', {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  const subject = extractSubject(actingFor)
  if (!subject) {
    throw deny('Forwarded `actingFor` must include a canonical subject.', {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  if (!identityForwarding.delegationSubject || subject !== identityForwarding.delegationSubject) {
    throw deny('Forwarded `actingFor` subject does not match the identity forwarding subject.', {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  return subject
}

export function extractIdentityForwardingFromArgs(
  args: unknown,
  expectedKeyOverrideOrOptions?:
    | IdentityForwardingKeyInput
    | IdentityForwardingEnvelopeContextOptions,
): IdentityForwardingIdentity | null {
  if (!isObject(args)) return null

  const input = args as IdentityForwardingInput
  const options =
    typeof expectedKeyOverrideOrOptions === 'string' ||
    typeof expectedKeyOverrideOrOptions === 'function'
      ? { expectedKeyOverride: expectedKeyOverrideOrOptions }
      : (expectedKeyOverrideOrOptions ?? {})

  if (input._trellisForwarding !== undefined) {
    if (typeof input._trellisForwarding !== 'string') {
      throw deny('Malformed identity forwarding envelope.', {
        source: 'identity-forwarding',
        category: 'auth',
      })
    }

    const key = getRequiredIdentityForwardingKey(options.expectedKeyOverride, args)
    const keyId = nonBlankString(process.env.CONVEX_IDENTITY_FORWARDING_KEY_ID)
    const keys = keyId
      ? { [identityForwardingDefaultKeyId]: key, [keyId]: key }
      : { [identityForwardingDefaultKeyId]: key }

    try {
      const payload = verifyIdentityForwardingEnvelope(input._trellisForwarding, {
        keys,
        expectedIssuer: options.expectedIssuer ?? identityForwardingAlphaIssuer,
        expectedAudience: options.expectedAudience ?? identityForwardingAlphaAudience,
        ...(options.expectedPurpose ? { expectedPurpose: options.expectedPurpose } : {}),
        ...(options.expectedTransport ? { expectedTransport: options.expectedTransport } : {}),
        ...(options.expectedFunctionRef ? { functionRef: options.expectedFunctionRef } : {}),
        args,
        ...(options.now !== undefined ? { now: options.now } : {}),
        ...(options.maxEnvelopeBytes !== undefined
          ? { maxEnvelopeBytes: options.maxEnvelopeBytes }
          : {}),
        ...(options.redeemJti ? { redeemJti: (jti) => options.redeemJti!(jti) } : {}),
      })

      const principalSubject = extractSubject(payload.caller)
      const delegationSubject =
        payload.actingFor === undefined ? undefined : extractSubject(payload.actingFor)

      if (
        !principalSubject ||
        principalSubject !== payload.sub ||
        (payload.actingFor !== undefined && !delegationSubject)
      ) {
        throw deny('Malformed identity forwarding envelope identity payload.', {
          source: 'identity-forwarding',
          category: 'auth',
        })
      }

      envelopePayloadByArgs.set(args, {
        caller: payload.caller,
        ...(payload.actingFor !== undefined ? { actingFor: payload.actingFor } : {}),
      })
      envelopeStateByArgs.set(args, {
        jti: payload.jti,
        purpose: payload.purpose,
        functionRef: payload.functionRef,
      })

      return {
        principalSubject,
        ...(delegationSubject ? { delegationSubject } : {}),
      }
    } catch (error) {
      throw toIdentityForwardingDeny(error)
    }
  }

  return null
}

export function createIdentityForwardingContextDelta(
  identity: IdentityForwardingIdentity | null,
  args?: unknown,
): IdentityForwardingContextCarrier {
  const payload =
    identity && isObject(args)
      ? (envelopePayloadByArgs.get(args) ??
        ({
          ...(Object.prototype.hasOwnProperty.call(args, 'caller')
            ? { caller: (args as { caller?: unknown }).caller }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(args, 'actingFor')
            ? { actingFor: (args as { actingFor?: unknown }).actingFor }
            : {}),
        } satisfies IdentityForwardingPayload))
      : null

  return {
    [identityForwardingContextKey]: identity,
    [identityForwardingPayloadContextKey]:
      payload && (payload.caller !== undefined || payload.actingFor !== undefined) ? payload : null,
    [identityForwardingEnvelopeContextKey]:
      identity && isObject(args) ? (envelopeStateByArgs.get(args) ?? null) : null,
  }
}

export function createIdentityForwardingEnvelopeArgs(
  options: CreateIdentityForwardingArgsOptions,
): Record<string, unknown> {
  const principalSubject = extractSubject(options.caller)
  if (!principalSubject) {
    throw new Error('Identity forwarding envelope requires a caller with a canonical subject.')
  }

  const delegationSubject =
    options.actingFor === undefined ? undefined : extractSubject(options.actingFor)
  if (options.actingFor !== undefined && !delegationSubject) {
    throw new Error('Identity forwarding envelope requires actingFor with a canonical subject.')
  }

  const purpose = options.purpose ?? options.operation
  const key = options.key ?? getRequiredIdentityForwardingKey()
  const keyId =
    options.keyId ??
    nonBlankString(process.env.CONVEX_IDENTITY_FORWARDING_KEY_ID) ??
    identityForwardingDefaultKeyId
  const args = {
    ...(options.args ?? {}),
  }

  return {
    ...args,
    _trellisForwarding: createIdentityForwardingEnvelope({
      key,
      keyId,
      iss: options.issuer ?? identityForwardingAlphaIssuer,
      aud: options.audience ?? identityForwardingAlphaAudience,
      jti: options.jti ?? crypto.randomUUID(),
      sub: principalSubject,
      caller: options.caller,
      ...(options.actingFor !== undefined ? { actingFor: options.actingFor } : {}),
      transport: options.transport ?? 'server',
      purpose,
      functionRef: options.functionRef,
      args,
      ...(options.now !== undefined ? { now: options.now } : {}),
      ttlMs: options.ttlMs ?? identityForwardingAlphaTtlsMs[purpose],
    }),
  }
}

export function getIdentityForwardingPayload(value: unknown): IdentityForwardingPayload | null {
  if (!isIdentityForwardingContextCarrier(value)) return null
  return (
    (value[identityForwardingPayloadContextKey] as IdentityForwardingPayload | null | undefined) ??
    null
  )
}

export function getIdentityForwardingEnvelopeState(
  value: unknown,
): IdentityForwardingEnvelopeState | null {
  if (!isIdentityForwardingContextCarrier(value)) return null
  return (
    (value[identityForwardingEnvelopeContextKey] as
      | IdentityForwardingEnvelopeState
      | null
      | undefined) ?? null
  )
}

export function hasForwardedIdentityFields(args: unknown): boolean {
  if (!isObject(args)) return false
  return (
    Object.prototype.hasOwnProperty.call(args, 'caller') ||
    Object.prototype.hasOwnProperty.call(args, 'actingFor') ||
    Object.prototype.hasOwnProperty.call(args, '_trellisForwarding') ||
    Object.prototype.hasOwnProperty.call(args, '_trellisForwardingKey')
  )
}

export function stripForwardedIdentityFields<TArgs>(args: TArgs): TArgs {
  if (!isObject(args)) return args

  const {
    caller: _principal,
    actingFor: _delegation,
    _trellisForwarding: _trellisForwarding,
    _trellisForwardingKey: _trellisForwardingKey,
    ...rest
  } = args as Record<string, unknown>

  return rest as TArgs
}

export function normalizeDelegationForForwarding(value: unknown): ActingFor | null {
  if (!isObject(value)) return null
  const subject = extractSubject(value)
  if (!subject) return null

  const reason = nonBlankString((value as { reason?: unknown }).reason)
  const grantedBy = nonBlankString((value as { grantedBy?: unknown }).grantedBy) as
    | Subject
    | undefined

  return {
    subject,
    ...(reason ? { reason } : {}),
    ...(grantedBy ? { grantedBy } : {}),
  }
}
