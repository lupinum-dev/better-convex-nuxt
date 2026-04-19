import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

import { deny } from '../auth/index.js'
import type { Delegation } from '../functions/define-delegation.js'
import type { Subject } from '../functions/define-principal.js'

export type TrustedForwardingIdentity = {
  principalSubject: Subject
  delegationSubject?: Subject
}

export type TrustedForwardingInput = {
  _trustedForwardingKey?: unknown
  _trustedForwarding?:
    | {
        principalSubject?: unknown
        delegationSubject?: unknown
      }
    | null
}

export type TrustedForwardingContextCarrier = Record<PropertyKey, unknown> & {
  [trustedForwardingContextKey]?: TrustedForwardingIdentity | null
  [trustedForwardingPayloadContextKey]?: TrustedForwardingPayload | null
}

export const trustedForwardingContextKey = Symbol('trellis.trustedForwarding')
export const trustedForwardingPayloadContextKey = Symbol('trellis.trustedForwardingPayload')

export type TrustedForwardingPayload = {
  principal?: unknown
  delegation?: unknown
}

export const trustedForwardingValidators = {
  _trustedForwardingKey: v.optional(v.string()),
  _trustedForwarding: v.optional(
    v.object({
      principalSubject: v.string(),
      delegationSubject: v.optional(v.string()),
    }),
  ),
} satisfies PropertyValidators

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
  if (a.byteLength !== b.byteLength) return false
  let mismatch = 0
  for (let i = 0; i < a.byteLength; i++) {
    mismatch |= a[i]! ^ b[i]!
  }
  return mismatch === 0
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

export function isCanonicalSubject(value: unknown): value is Subject {
  return typeof value === 'string' && /^(user|agent|service|webhook|system):\S+$/.test(value)
}

export function extractSubject(value: unknown): Subject | undefined {
  const subject = nonBlankString(
    isObject(value) && 'subject' in value ? (value as { subject?: unknown }).subject : undefined,
  )
  return isCanonicalSubject(subject) ? subject : undefined
}

export function isAnonymousPrincipalLike(value: unknown): boolean {
  return (
    isObject(value) &&
    'kind' in value &&
    (value as { kind?: unknown }).kind === 'anonymous'
  )
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
  expectedKeyOverride?: string,
): TrustedForwardingIdentity | null {
  if (!isObject(args)) return null

  const input = args as TrustedForwardingInput
  const hasTransport =
    input._trustedForwardingKey !== undefined || input._trustedForwarding !== undefined
  if (!hasTransport) return null

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

  const expectedKey =
    nonBlankString(expectedKeyOverride) ??
    nonBlankString(process.env.CONVEX_TRUSTED_FORWARDING_KEY)

  if (!expectedKey) {
    throw deny(
      'Trusted forwarding auth is not configured. Set CONVEX_TRUSTED_FORWARDING_KEY.',
      {
        source: 'trusted-forwarding',
        category: 'auth',
      },
    )
  }

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

export function createTrustedForwardingContextDelta(
  identity: TrustedForwardingIdentity | null,
  args?: unknown,
): TrustedForwardingContextCarrier {
  const payload =
    identity && isObject(args)
      ? ({
          ...(Object.prototype.hasOwnProperty.call(args, 'principal')
            ? { principal: (args as { principal?: unknown }).principal }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(args, 'delegation')
            ? { delegation: (args as { delegation?: unknown }).delegation }
            : {}),
        } satisfies TrustedForwardingPayload)
      : null

  return {
    [trustedForwardingContextKey]: identity,
    [trustedForwardingPayloadContextKey]:
      payload && (payload.principal !== undefined || payload.delegation !== undefined) ? payload : null,
  }
}

export function getTrustedForwardingPayload(
  value: unknown,
): TrustedForwardingPayload | null {
  if (!isTrustedForwardingContextCarrier(value)) return null
  return (value[trustedForwardingPayloadContextKey] as TrustedForwardingPayload | null | undefined) ?? null
}

export function hasForwardedIdentityFields(args: unknown): boolean {
  if (!isObject(args)) return false
  return (
    Object.prototype.hasOwnProperty.call(args, 'principal') ||
    Object.prototype.hasOwnProperty.call(args, 'delegation') ||
    Object.prototype.hasOwnProperty.call(args, '_trustedForwardingKey') ||
    Object.prototype.hasOwnProperty.call(args, '_trustedForwarding')
  )
}

export function stripForwardedIdentityFields<TArgs>(args: TArgs): TArgs {
  if (!isObject(args)) return args

  const {
    principal: _principal,
    delegation: _delegation,
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
