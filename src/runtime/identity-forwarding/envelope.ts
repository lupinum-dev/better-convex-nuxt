import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'

export type IdentityForwardingTransport = 'server' | 'webhook' | 'mcp' | 'bridge'
export type IdentityForwardingPurpose =
  | 'query'
  | 'mutation'
  | 'action'
  | 'operation-preview'
  | 'operation-execute'

export interface IdentityForwardingEnvelopePayload {
  readonly v: 1
  readonly kid: string
  readonly iss: string
  readonly aud: string
  readonly jti: string
  readonly sub: string
  readonly caller: unknown
  readonly actingFor?: unknown
  readonly transport: IdentityForwardingTransport
  readonly purpose: IdentityForwardingPurpose
  readonly functionRef: string
  readonly argsHash: string
  readonly issuedAt: number
  readonly expiresAt: number
}

export interface CreateIdentityForwardingEnvelopeOptions extends Omit<
  IdentityForwardingEnvelopePayload,
  'v' | 'kid' | 'argsHash' | 'issuedAt' | 'expiresAt'
> {
  readonly keyId: string
  readonly key: string
  readonly args: unknown
  readonly now?: number
  readonly ttlMs: number
}

export interface VerifyIdentityForwardingEnvelopeOptions {
  readonly keys: Record<string, string>
  readonly expectedIssuer: string
  readonly expectedAudience: string
  readonly expectedPurpose?: IdentityForwardingPurpose
  readonly expectedTransport?: IdentityForwardingTransport
  readonly functionRef?: string
  readonly args: unknown
  readonly now?: number
  readonly clockSkewMs?: number
  readonly maxEnvelopeBytes?: number
  readonly redeemJti?: (jti: string, payload: IdentityForwardingEnvelopePayload) => boolean
}

export class IdentityForwardingEnvelopeError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'malformed'
      | 'unsupported-algorithm'
      | 'unknown-key'
      | 'invalid-signature'
      | 'issuer'
      | 'audience'
      | 'purpose'
      | 'transport'
      | 'function-ref'
      | 'args-hash'
      | 'ttl'
      | 'expired'
      | 'not-yet-valid'
      | 'too-large'
      | 'replayed',
  ) {
    super(message)
    this.name = 'IdentityForwardingEnvelopeError'
  }
}

const headerType = 'trellis-forwarding+jws'
export const defaultIdentityForwardingMaxEnvelopeBytes = 8_192
export const identityForwardingPurposeMaxTtlsMs = {
  query: 60_000,
  mutation: 30_000,
  action: 30_000,
  'operation-preview': 30_000,
  'operation-execute': 10_000,
} satisfies Record<IdentityForwardingPurpose, number>
const excludedArgsKeys = new Set([
  '_trellisForwarding',
  '_trellisForwardingKey',
  '_identityForwardingKey',
  '_identityForwarding',
  '__trellis',
])

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const base64UrlAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const base64UrlLookup = new Map([...base64UrlAlphabet].map((char, index) => [char, index]))

function utf8Bytes(input: string): Uint8Array {
  return textEncoder.encode(input)
}

function base64UrlEncodeBytes(input: Uint8Array): string {
  let output = ''
  for (let index = 0; index < input.length; index += 3) {
    const first = input[index] ?? 0
    const second = input[index + 1] ?? 0
    const third = input[index + 2] ?? 0
    const value = (first << 16) | (second << 8) | third

    output += base64UrlAlphabet[(value >> 18) & 63]
    output += base64UrlAlphabet[(value >> 12) & 63]
    if (index + 1 < input.length) output += base64UrlAlphabet[(value >> 6) & 63]
    if (index + 2 < input.length) output += base64UrlAlphabet[value & 63]
  }
  return output
}

function base64UrlEncode(input: string): string {
  return base64UrlEncodeBytes(utf8Bytes(input))
}

function base64UrlDecode(input: string): Uint8Array {
  if (input.length % 4 === 1) {
    throw new IdentityForwardingEnvelopeError(
      'Invalid forwarding envelope base64url part.',
      'malformed',
    )
  }

  const bytes: number[] = []
  for (let index = 0; index < input.length; index += 4) {
    const remaining = input.length - index
    const first = base64UrlLookup.get(input[index] ?? '')
    const second = base64UrlLookup.get(input[index + 1] ?? '')
    const third = remaining > 2 ? base64UrlLookup.get(input[index + 2] ?? '') : 0
    const fourth = remaining > 3 ? base64UrlLookup.get(input[index + 3] ?? '') : 0
    if (
      first === undefined ||
      second === undefined ||
      third === undefined ||
      fourth === undefined
    ) {
      throw new IdentityForwardingEnvelopeError(
        'Invalid forwarding envelope base64url part.',
        'malformed',
      )
    }

    const value = (first << 18) | (second << 12) | (third << 6) | fourth
    bytes.push((value >> 16) & 255)
    if (remaining > 2) bytes.push((value >> 8) & 255)
    if (remaining > 3) bytes.push(value & 255)
  }
  return new Uint8Array(bytes)
}

function parseJsonPart<T>(part: string, label: string): T {
  try {
    return JSON.parse(textDecoder.decode(base64UrlDecode(part))) as T
  } catch {
    throw new IdentityForwardingEnvelopeError(`Invalid forwarding envelope ${label}.`, 'malformed')
  }
}

function assertSupportedCanonicalObject(value: object): void {
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw new IdentityForwardingEnvelopeError(
      'Unsupported binary value in forwarding envelope canonical JSON.',
      'malformed',
    )
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new IdentityForwardingEnvelopeError(
      'Unsupported object value in forwarding envelope canonical JSON.',
      'malformed',
    )
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null'

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry ?? null)).join(',')}]`
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value)
    case 'number':
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        throw new IdentityForwardingEnvelopeError(
          'Unsupported number in forwarding envelope canonical JSON.',
          'malformed',
        )
      }
      return JSON.stringify(value)
    case 'undefined':
      return 'null'
    case 'object': {
      assertSupportedCanonicalObject(value)
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))

      return `{${entries
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
        .join(',')}}`
    }
    default:
      throw new IdentityForwardingEnvelopeError(
        `Unsupported value in forwarding envelope canonical JSON: ${typeof value}.`,
        'malformed',
      )
  }
}

export function canonicalizeForwardingArgs(args: unknown): string {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return canonicalJson(args)
  }
  assertSupportedCanonicalObject(args)
  const filtered = Object.fromEntries(
    Object.entries(args as Record<string, unknown>).filter(
      ([key, entry]) => entry !== undefined && !excludedArgsKeys.has(key),
    ),
  )
  return canonicalJson(filtered)
}

export function hashForwardingArgs(args: unknown): string {
  return base64UrlEncodeBytes(sha256(utf8Bytes(canonicalizeForwardingArgs(args))))
}

function sign(input: string, key: string): string {
  return base64UrlEncodeBytes(hmac(sha256, utf8Bytes(key), utf8Bytes(input)))
}

function verifySignature(input: string, signature: string, key: string): boolean {
  let provided: Uint8Array
  try {
    provided = base64UrlDecode(signature)
  } catch {
    return false
  }
  const expected = hmac(sha256, utf8Bytes(key), utf8Bytes(input))
  if (provided.length !== expected.length) return false
  let mismatch = 0
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected[index]! ^ provided[index]!
  }
  return mismatch === 0
}

export function createIdentityForwardingEnvelope(
  options: CreateIdentityForwardingEnvelopeOptions,
): string {
  const now = options.now ?? Date.now()
  const payload: IdentityForwardingEnvelopePayload = {
    v: 1,
    kid: options.keyId,
    iss: options.iss,
    aud: options.aud,
    jti: options.jti,
    sub: options.sub,
    caller: options.caller,
    ...(options.actingFor === undefined ? {} : { actingFor: options.actingFor }),
    transport: options.transport,
    purpose: options.purpose,
    functionRef: options.functionRef,
    argsHash: hashForwardingArgs(options.args),
    issuedAt: now,
    expiresAt: now + options.ttlMs,
  }
  const header = {
    alg: 'HS256',
    kid: options.keyId,
    typ: headerType,
    v: 1,
  }
  const signingInput = `${base64UrlEncode(canonicalJson(header))}.${base64UrlEncode(
    canonicalJson(payload),
  )}`

  return `${signingInput}.${sign(signingInput, options.key)}`
}

export function verifyIdentityForwardingEnvelope(
  envelope: string,
  options: VerifyIdentityForwardingEnvelopeOptions,
): IdentityForwardingEnvelopePayload {
  const maxEnvelopeBytes = options.maxEnvelopeBytes ?? defaultIdentityForwardingMaxEnvelopeBytes
  if (utf8Bytes(envelope).length > maxEnvelopeBytes) {
    throw new IdentityForwardingEnvelopeError('Forwarding envelope is too large.', 'too-large')
  }

  const parts = envelope.split('.')
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new IdentityForwardingEnvelopeError('Malformed forwarding envelope.', 'malformed')
  }

  const [encodedHeader, encodedPayload, signature] = parts as [string, string, string]
  const header = parseJsonPart<{
    alg?: unknown
    kid?: unknown
    typ?: unknown
    v?: unknown
  }>(encodedHeader, 'header')

  if (header.alg !== 'HS256' || header.typ !== headerType || header.v !== 1) {
    throw new IdentityForwardingEnvelopeError(
      'Unsupported forwarding envelope algorithm.',
      'unsupported-algorithm',
    )
  }
  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new IdentityForwardingEnvelopeError('Forwarding envelope has no key id.', 'malformed')
  }

  const key = options.keys[header.kid]
  if (!key) {
    throw new IdentityForwardingEnvelopeError('Unknown forwarding envelope key id.', 'unknown-key')
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`
  if (!verifySignature(signingInput, signature, key)) {
    throw new IdentityForwardingEnvelopeError(
      'Invalid forwarding envelope signature.',
      'invalid-signature',
    )
  }

  const payload = parseJsonPart<IdentityForwardingEnvelopePayload>(encodedPayload, 'payload')
  if (payload.v !== 1 || payload.kid !== header.kid) {
    throw new IdentityForwardingEnvelopeError('Malformed forwarding envelope payload.', 'malformed')
  }
  if (
    typeof payload.issuedAt !== 'number' ||
    !Number.isFinite(payload.issuedAt) ||
    typeof payload.expiresAt !== 'number' ||
    !Number.isFinite(payload.expiresAt)
  ) {
    throw new IdentityForwardingEnvelopeError('Malformed forwarding envelope payload.', 'malformed')
  }
  if (payload.iss !== options.expectedIssuer) {
    throw new IdentityForwardingEnvelopeError('Forwarding envelope issuer mismatch.', 'issuer')
  }
  if (payload.aud !== options.expectedAudience) {
    throw new IdentityForwardingEnvelopeError('Forwarding envelope audience mismatch.', 'audience')
  }
  if (options.expectedPurpose !== undefined && payload.purpose !== options.expectedPurpose) {
    throw new IdentityForwardingEnvelopeError('Forwarding envelope purpose mismatch.', 'purpose')
  }
  if (options.expectedTransport !== undefined && payload.transport !== options.expectedTransport) {
    throw new IdentityForwardingEnvelopeError(
      'Forwarding envelope transport mismatch.',
      'transport',
    )
  }
  if (options.functionRef !== undefined && payload.functionRef !== options.functionRef) {
    throw new IdentityForwardingEnvelopeError(
      'Forwarding envelope function ref mismatch.',
      'function-ref',
    )
  }
  if (payload.argsHash !== hashForwardingArgs(options.args)) {
    throw new IdentityForwardingEnvelopeError('Forwarding envelope args mismatch.', 'args-hash')
  }

  const now = options.now ?? Date.now()
  const skew = options.clockSkewMs ?? 0
  const maxTtlMs = identityForwardingPurposeMaxTtlsMs[payload.purpose]
  if (maxTtlMs === undefined || payload.expiresAt - payload.issuedAt > maxTtlMs) {
    throw new IdentityForwardingEnvelopeError(
      'Forwarding envelope TTL exceeds purpose maximum.',
      'ttl',
    )
  }
  if (payload.issuedAt > now + skew) {
    throw new IdentityForwardingEnvelopeError(
      'Forwarding envelope is not yet valid.',
      'not-yet-valid',
    )
  }
  if (payload.expiresAt < now - skew) {
    throw new IdentityForwardingEnvelopeError('Forwarding envelope expired.', 'expired')
  }
  if (options.redeemJti && !options.redeemJti(payload.jti, payload)) {
    throw new IdentityForwardingEnvelopeError('Forwarding envelope replay detected.', 'replayed')
  }

  return payload
}
