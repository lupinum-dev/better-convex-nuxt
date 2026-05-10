import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

import { deny } from '../auth/index.js'
import { getSubjectKind, getSubjectValue, subject } from '../auth/subject.js'
import type { Delegation } from '../functions/define-delegation.js'
import type { Subject } from '../functions/define-principal.js'
import {
  createTrustedForwardingEnvelope,
  trustedForwardingPurposeMaxTtlsMs,
  TrustedForwardingEnvelopeError,
  verifyTrustedForwardingEnvelope,
  type TrustedForwardingPurpose,
  type TrustedForwardingTransport,
} from './envelope.js'

export type TrustedForwardingIdentity = {
  principalSubject: Subject
  delegationSubject?: Subject
}

export type TrustedForwardingInput = {
  _trellisForwarding?: unknown
  _trustedForwardingKey?: unknown
  _trustedForwarding?: {
    principalSubject?: unknown
    delegationSubject?: unknown
  } | null
}

const rawForwardingFallbackObservation = {
  count: 0,
}

export type TrustedForwardingContextCarrier = Record<PropertyKey, unknown> & {
  [trustedForwardingContextKey]?: TrustedForwardingIdentity | null
  [trustedForwardingPayloadContextKey]?: TrustedForwardingPayload | null
  [trustedForwardingEnvelopeContextKey]?: TrustedForwardingEnvelopeState | null
}

export const trustedForwardingContextKey = Symbol('trellis.trustedForwarding')
export const trustedForwardingPayloadContextKey = Symbol('trellis.trustedForwardingPayload')
export const trustedForwardingEnvelopeContextKey = Symbol('trellis.trustedForwardingEnvelope')

export type TrustedForwardingPayload = {
  principal?: unknown
  delegation?: unknown
}

export type TrustedForwardingEnvelopeState = {
  jti: string
  purpose: TrustedForwardingPurpose
  functionRef: string
}

const envelopePayloadByArgs = new WeakMap<object, TrustedForwardingPayload>()
const envelopeStateByArgs = new WeakMap<object, TrustedForwardingEnvelopeState>()

export const trustedForwardingValidators = {
  _trellisForwarding: v.optional(v.string()),
  _trustedForwardingKey: v.optional(v.string()),
  _trustedForwarding: v.optional(
    v.object({
      principalSubject: v.string(),
      delegationSubject: v.optional(v.string()),
    }),
  ),
} satisfies PropertyValidators

export const trustedForwardingAlphaIssuer = 'trellis://server'
export const trustedForwardingAlphaAudience = 'trellis://convex'
export const trustedForwardingDefaultKeyId = 'default'

export const trustedForwardingAlphaTtlsMs = {
  ...trustedForwardingPurposeMaxTtlsMs,
} satisfies Record<TrustedForwardingPurpose, number>

export type TrustedForwardingEnvelopeContextOptions = {
  expectedKeyOverride?: string
  expectedIssuer?: string
  expectedAudience?: string
  expectedFunctionRef?: string
  expectedPurpose?: TrustedForwardingPurpose
  expectedTransport?: TrustedForwardingTransport
  now?: number
  maxEnvelopeBytes?: number
  redeemJti?: (jti: string) => boolean
}

export type CreateTrustedForwardingArgsOptions = {
  args?: Record<string, unknown>
  principal: { subject: Subject } & Record<string, unknown>
  delegation?: Delegation
  functionRef: string
  operation: 'query' | 'mutation' | 'action'
  purpose?: TrustedForwardingPurpose
  transport?: TrustedForwardingTransport
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

export function isTrustedForwardingContextCarrier(
  value: unknown,
): value is TrustedForwardingContextCarrier {
  return isObject(value)
}

export function verifyTrustedForwardingKey(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const enc = new TextEncoder()
  const a = enc.encode(provided)
  const b = enc.encode(expected)
  let mismatch = a.byteLength ^ b.byteLength
  for (let i = 0; i < b.byteLength; i++) {
    mismatch |= (a[i] ?? 0) ^ b[i]!
  }
  return mismatch === 0
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function getRequiredTrustedForwardingKey(override?: string): string {
  const key = nonBlankString(override) ?? nonBlankString(process.env.CONVEX_TRUSTED_FORWARDING_KEY)

  if (!key) {
    throw deny('Trusted forwarding auth is not configured. Set CONVEX_TRUSTED_FORWARDING_KEY.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  const keyIssue = getTrustedForwardingKeyProductionIssue(key)
  if (keyIssue) {
    throw deny(keyIssue, {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  return key
}

function toTrustedForwardingDeny(error: unknown): Error {
  if (error instanceof TrustedForwardingEnvelopeError) {
    return deny(`Invalid trusted forwarding envelope: ${error.code}.`, {
      source: 'trusted-forwarding',
      category: 'auth',
    }) as Error
  }

  if (error instanceof Error) return error

  return deny('Invalid trusted forwarding envelope.', {
    source: 'trusted-forwarding',
    category: 'auth',
  }) as Error
}

function hasRawTrustedForwardingInput(input: TrustedForwardingInput): boolean {
  return input._trustedForwardingKey !== undefined || input._trustedForwarding !== undefined
}

function assertRawForwardingFallbackAllowed(input: TrustedForwardingInput): void {
  if (!hasRawTrustedForwardingInput(input)) return

  if (process.env.NODE_ENV === 'production') {
    throw deny('Raw trusted forwarding fields are not accepted in production.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  rawForwardingFallbackObservation.count += 1
}

export const minimumTrustedForwardingKeyLength = 32

const obviousDevelopmentKeyPatterns = [
  /replace[-_ ]?me/i,
  /change[-_ ]?me/i,
  /placeholder/i,
  /\bexample\b/i,
  /\b(?:dev|test|local)(?:[-_ ]?(?:key|secret))?\b/i,
  /\btrusted[-_ ]?key\b/i,
  /\bbridge[-_ ]?secret\b/i,
]

export function isWeakTrustedForwardingKey(value: string): boolean {
  return value.trim().length < minimumTrustedForwardingKeyLength
}

export function isObviouslyDevLikeTrustedForwardingKey(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  return obviousDevelopmentKeyPatterns.some((pattern) => pattern.test(trimmed))
}

export function getTrustedForwardingKeyProductionIssue(
  value: string,
  nodeEnv = process.env.NODE_ENV,
): string | null {
  if (nodeEnv !== 'production') return null

  if (isWeakTrustedForwardingKey(value)) {
    return `CONVEX_TRUSTED_FORWARDING_KEY must be at least ${minimumTrustedForwardingKeyLength} characters in production.`
  }

  if (isObviouslyDevLikeTrustedForwardingKey(value)) {
    return 'CONVEX_TRUSTED_FORWARDING_KEY looks like a development or placeholder value. Replace it with a long random shared secret in production.'
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

export function isAnonymousPrincipalLike(value: unknown): boolean {
  return isObject(value) && 'kind' in value && (value as { kind?: unknown }).kind === 'anonymous'
}

export function assertForwardablePrincipal(
  principal: unknown,
  trustedForwarding: TrustedForwardingIdentity,
): Subject {
  if (!isObject(principal) || isAnonymousPrincipalLike(principal)) {
    throw deny('Forwarded `principal` must be a non-anonymous object with a canonical subject.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  const subject = extractSubject(principal)
  if (!subject) {
    throw deny('Forwarded `principal` must include a canonical subject.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  if (subject !== trustedForwarding.principalSubject) {
    throw deny('Forwarded `principal` subject does not match the trusted forwarding subject.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  return subject
}

export function assertForwardableDelegation(
  delegation: unknown,
  trustedForwarding: TrustedForwardingIdentity,
): Subject {
  if (!isObject(delegation)) {
    throw deny('Forwarded `delegation` must be an object with a canonical subject.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  const subject = extractSubject(delegation)
  if (!subject) {
    throw deny('Forwarded `delegation` must include a canonical subject.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  if (!trustedForwarding.delegationSubject || subject !== trustedForwarding.delegationSubject) {
    throw deny('Forwarded `delegation` subject does not match the trusted forwarding subject.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  return subject
}

export function extractTrustedForwardingFromArgs(
  args: unknown,
  expectedKeyOverrideOrOptions?: string | TrustedForwardingEnvelopeContextOptions,
): TrustedForwardingIdentity | null {
  if (!isObject(args)) return null

  const input = args as TrustedForwardingInput
  const options =
    typeof expectedKeyOverrideOrOptions === 'string'
      ? { expectedKeyOverride: expectedKeyOverrideOrOptions }
      : (expectedKeyOverrideOrOptions ?? {})

  if (input._trellisForwarding !== undefined) {
    if (hasRawTrustedForwardingInput(input) && process.env.NODE_ENV === 'production') {
      throw deny('Mixed signed and raw trusted forwarding fields are not accepted in production.', {
        source: 'trusted-forwarding',
        category: 'auth',
      })
    }

    if (typeof input._trellisForwarding !== 'string') {
      throw deny('Malformed trusted forwarding envelope.', {
        source: 'trusted-forwarding',
        category: 'auth',
      })
    }

    const key = getRequiredTrustedForwardingKey(options.expectedKeyOverride)
    const keyId = nonBlankString(process.env.CONVEX_TRUSTED_FORWARDING_KEY_ID)
    const keys = keyId
      ? { [trustedForwardingDefaultKeyId]: key, [keyId]: key }
      : { [trustedForwardingDefaultKeyId]: key }

    try {
      const payload = verifyTrustedForwardingEnvelope(input._trellisForwarding, {
        keys,
        expectedIssuer: options.expectedIssuer ?? trustedForwardingAlphaIssuer,
        expectedAudience: options.expectedAudience ?? trustedForwardingAlphaAudience,
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

      const principalSubject = extractSubject(payload.principal)
      const delegationSubject =
        payload.delegation === undefined ? undefined : extractSubject(payload.delegation)

      if (
        !principalSubject ||
        principalSubject !== payload.sub ||
        (payload.delegation !== undefined && !delegationSubject)
      ) {
        throw deny('Malformed trusted forwarding envelope identity payload.', {
          source: 'trusted-forwarding',
          category: 'auth',
        })
      }

      envelopePayloadByArgs.set(args, {
        principal: payload.principal,
        ...(payload.delegation !== undefined ? { delegation: payload.delegation } : {}),
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
      throw toTrustedForwardingDeny(error)
    }
  }

  const hasTransport =
    input._trustedForwardingKey !== undefined || input._trustedForwarding !== undefined
  if (!hasTransport) return null

  assertRawForwardingFallbackAllowed(input)

  const principalSubject = nonBlankString(input._trustedForwarding?.principalSubject)
  const delegationSubject = nonBlankString(input._trustedForwarding?.delegationSubject)

  if (
    typeof input._trustedForwardingKey !== 'string' ||
    !isCanonicalSubject(principalSubject) ||
    (delegationSubject !== undefined && !isCanonicalSubject(delegationSubject))
  ) {
    throw deny('Malformed trusted forwarding payload.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  const expectedKey = getRequiredTrustedForwardingKey(options.expectedKeyOverride)

  if (!verifyTrustedForwardingKey(input._trustedForwardingKey, expectedKey)) {
    throw deny('Invalid trusted forwarding credentials.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  return {
    principalSubject: principalSubject as Subject,
    ...(delegationSubject ? { delegationSubject: delegationSubject as Subject } : {}),
  }
}

export function getRawTrustedForwardingFallbackCount(): number {
  return rawForwardingFallbackObservation.count
}

export function createTrustedForwardingContextDelta(
  identity: TrustedForwardingIdentity | null,
  args?: unknown,
): TrustedForwardingContextCarrier {
  const payload =
    identity && isObject(args)
      ? (envelopePayloadByArgs.get(args) ??
        ({
          ...(Object.prototype.hasOwnProperty.call(args, 'principal')
            ? { principal: (args as { principal?: unknown }).principal }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(args, 'delegation')
            ? { delegation: (args as { delegation?: unknown }).delegation }
            : {}),
        } satisfies TrustedForwardingPayload))
      : null

  return {
    [trustedForwardingContextKey]: identity,
    [trustedForwardingPayloadContextKey]:
      payload && (payload.principal !== undefined || payload.delegation !== undefined)
        ? payload
        : null,
    [trustedForwardingEnvelopeContextKey]:
      identity && isObject(args) ? (envelopeStateByArgs.get(args) ?? null) : null,
  }
}

export function createTrustedForwardingEnvelopeArgs(
  options: CreateTrustedForwardingArgsOptions,
): Record<string, unknown> {
  const principalSubject = extractSubject(options.principal)
  if (!principalSubject) {
    throw new Error('Trusted forwarding envelope requires a principal with a canonical subject.')
  }

  const delegationSubject =
    options.delegation === undefined ? undefined : extractSubject(options.delegation)
  if (options.delegation !== undefined && !delegationSubject) {
    throw new Error('Trusted forwarding envelope requires delegation with a canonical subject.')
  }

  const purpose = options.purpose ?? options.operation
  const key = options.key ?? getRequiredTrustedForwardingKey()
  const keyId =
    options.keyId ??
    nonBlankString(process.env.CONVEX_TRUSTED_FORWARDING_KEY_ID) ??
    trustedForwardingDefaultKeyId
  const args = {
    ...(options.args ?? {}),
  }

  return {
    ...args,
    _trellisForwarding: createTrustedForwardingEnvelope({
      key,
      keyId,
      iss: options.issuer ?? trustedForwardingAlphaIssuer,
      aud: options.audience ?? trustedForwardingAlphaAudience,
      jti: options.jti ?? crypto.randomUUID(),
      sub: principalSubject,
      principal: options.principal,
      ...(options.delegation !== undefined ? { delegation: options.delegation } : {}),
      transport: options.transport ?? 'server',
      purpose,
      functionRef: options.functionRef,
      args,
      ...(options.now !== undefined ? { now: options.now } : {}),
      ttlMs: options.ttlMs ?? trustedForwardingAlphaTtlsMs[purpose],
    }),
  }
}

export function getTrustedForwardingPayload(value: unknown): TrustedForwardingPayload | null {
  if (!isTrustedForwardingContextCarrier(value)) return null
  return (
    (value[trustedForwardingPayloadContextKey] as TrustedForwardingPayload | null | undefined) ??
    null
  )
}

export function getTrustedForwardingEnvelopeState(
  value: unknown,
): TrustedForwardingEnvelopeState | null {
  if (!isTrustedForwardingContextCarrier(value)) return null
  return (
    (value[trustedForwardingEnvelopeContextKey] as
      | TrustedForwardingEnvelopeState
      | null
      | undefined) ?? null
  )
}

export function hasForwardedIdentityFields(args: unknown): boolean {
  if (!isObject(args)) return false
  return (
    Object.prototype.hasOwnProperty.call(args, 'principal') ||
    Object.prototype.hasOwnProperty.call(args, 'delegation') ||
    Object.prototype.hasOwnProperty.call(args, '_trellisForwarding') ||
    Object.prototype.hasOwnProperty.call(args, '_trustedForwardingKey') ||
    Object.prototype.hasOwnProperty.call(args, '_trustedForwarding')
  )
}

export function stripForwardedIdentityFields<TArgs>(args: TArgs): TArgs {
  if (!isObject(args)) return args

  const {
    principal: _principal,
    delegation: _delegation,
    _trellisForwarding: _trellisForwarding,
    _trustedForwardingKey: _trustedForwardingKey,
    _trustedForwarding: _trustedForwarding,
    ...rest
  } = args as Record<string, unknown>

  return rest as TArgs
}

export function normalizeDelegationForForwarding(value: unknown): Delegation | null {
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
