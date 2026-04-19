import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

import { deny } from '../auth/index.js'

export type TrustedCallerIdentity = {
  userId: string
}

export type TrustedCallerInput = {
  _trustedCallerKey?: unknown
  _trustedCaller?: {
    userId?: unknown
  } | null
}

export type TrustedCallerContextCarrier = Record<PropertyKey, unknown> & {
  [trustedCallerContextKey]?: TrustedCallerIdentity | null
}

export const trustedCallerContextKey = Symbol('trellis.trustedCaller')

export const trustedCallerValidators = {
  _trustedCallerKey: v.optional(v.string()),
  _trustedCaller: v.optional(
    v.object({
      userId: v.string(),
    }),
  ),
} satisfies PropertyValidators

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isTrustedCallerContextCarrier(
  value: unknown,
): value is TrustedCallerContextCarrier {
  return isObject(value)
}

export function verifyTrustedCallerKey(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  // Encode to UTF-8 bytes — avoids charCodeAt NaN issues and ensures consistent encoding.
  // node:crypto is not available in Convex V8 isolates; XOR over Uint8Array is the
  // closest constant-time approximation possible in that environment.
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

export function extractTrustedCallerFromArgs(
  args: unknown,
  expectedKeyOverride?: string,
): TrustedCallerIdentity | null {
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

  const nonBlank = (s: string | undefined): string | undefined => s?.trim() || undefined
  const expectedKey = nonBlank(expectedKeyOverride) ?? nonBlank(process.env.CONVEX_TRUSTED_CALLER_KEY)

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

export function createTrustedCallerContextDelta(
  identity: TrustedCallerIdentity | null,
): TrustedCallerContextCarrier {
  return {
    [trustedCallerContextKey]: identity,
  }
}
