import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export type TrustedForwardingTransport = 'server' | 'webhook' | 'mcp' | 'bridge'
export type TrustedForwardingPurpose =
  | 'query'
  | 'mutation'
  | 'action'
  | 'operation-preview'
  | 'operation-execute'

export interface TrustedForwardingEnvelopePayload {
  readonly v: 1
  readonly kid: string
  readonly iss: string
  readonly aud: string
  readonly jti: string
  readonly sub: string
  readonly principal: unknown
  readonly delegation?: unknown
  readonly transport: TrustedForwardingTransport
  readonly purpose: TrustedForwardingPurpose
  readonly functionRef: string
  readonly argsHash: string
  readonly issuedAt: number
  readonly expiresAt: number
}

export interface CreateTrustedForwardingEnvelopeOptions extends Omit<
  TrustedForwardingEnvelopePayload,
  'v' | 'kid' | 'argsHash' | 'issuedAt' | 'expiresAt'
> {
  readonly keyId: string
  readonly key: string
  readonly args: unknown
  readonly now?: number
  readonly ttlMs: number
}

export interface VerifyTrustedForwardingEnvelopeOptions {
  readonly keys: Record<string, string>
  readonly expectedIssuer: string
  readonly expectedAudience: string
  readonly expectedPurpose?: TrustedForwardingPurpose
  readonly expectedTransport?: TrustedForwardingTransport
  readonly functionRef?: string
  readonly args: unknown
  readonly now?: number
  readonly clockSkewMs?: number
  readonly maxEnvelopeBytes?: number
  readonly redeemJti?: (jti: string, payload: TrustedForwardingEnvelopePayload) => boolean
}

export class TrustedForwardingEnvelopeError extends Error {
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
    this.name = 'TrustedForwardingEnvelopeError'
  }
}

const headerType = 'trellis-forwarding+jws'
export const defaultTrustedForwardingMaxEnvelopeBytes = 8_192
export const trustedForwardingPurposeMaxTtlsMs = {
  query: 60_000,
  mutation: 30_000,
  action: 30_000,
  'operation-preview': 30_000,
  'operation-execute': 10_000,
} satisfies Record<TrustedForwardingPurpose, number>
const excludedArgsKeys = new Set([
  '_trellisForwarding',
  '_trustedForwardingKey',
  '_trustedForwarding',
  '__trellis',
  'principal',
  'delegation',
])

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

function parseJsonPart<T>(part: string, label: string): T {
  try {
    return JSON.parse(base64UrlDecode(part).toString('utf8')) as T
  } catch {
    throw new TrustedForwardingEnvelopeError(`Invalid forwarding envelope ${label}.`, 'malformed')
  }
}

function assertSupportedCanonicalObject(value: object): void {
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw new TrustedForwardingEnvelopeError(
      'Unsupported binary value in forwarding envelope canonical JSON.',
      'malformed',
    )
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TrustedForwardingEnvelopeError(
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
        throw new TrustedForwardingEnvelopeError(
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
        .sort(([left], [right]) => left.localeCompare(right))

      return `{${entries
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
        .join(',')}}`
    }
    default:
      throw new TrustedForwardingEnvelopeError(
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
  return createHash('sha256').update(canonicalizeForwardingArgs(args)).digest('base64url')
}

function sign(input: string, key: string): string {
  return createHmac('sha256', key).update(input).digest('base64url')
}

function verifySignature(input: string, signature: string, key: string): boolean {
  const expected = sign(input, key)
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function createTrustedForwardingEnvelope(
  options: CreateTrustedForwardingEnvelopeOptions,
): string {
  const now = options.now ?? Date.now()
  const payload: TrustedForwardingEnvelopePayload = {
    v: 1,
    kid: options.keyId,
    iss: options.iss,
    aud: options.aud,
    jti: options.jti,
    sub: options.sub,
    principal: options.principal,
    ...(options.delegation === undefined ? {} : { delegation: options.delegation }),
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

export function verifyTrustedForwardingEnvelope(
  envelope: string,
  options: VerifyTrustedForwardingEnvelopeOptions,
): TrustedForwardingEnvelopePayload {
  const maxEnvelopeBytes = options.maxEnvelopeBytes ?? defaultTrustedForwardingMaxEnvelopeBytes
  if (Buffer.byteLength(envelope, 'utf8') > maxEnvelopeBytes) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope is too large.', 'too-large')
  }

  const parts = envelope.split('.')
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new TrustedForwardingEnvelopeError('Malformed forwarding envelope.', 'malformed')
  }

  const [encodedHeader, encodedPayload, signature] = parts as [string, string, string]
  const header = parseJsonPart<{
    alg?: unknown
    kid?: unknown
    typ?: unknown
    v?: unknown
  }>(encodedHeader, 'header')

  if (header.alg !== 'HS256' || header.typ !== headerType || header.v !== 1) {
    throw new TrustedForwardingEnvelopeError(
      'Unsupported forwarding envelope algorithm.',
      'unsupported-algorithm',
    )
  }
  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope has no key id.', 'malformed')
  }

  const key = options.keys[header.kid]
  if (!key) {
    throw new TrustedForwardingEnvelopeError(
      `Unknown forwarding envelope key id "${header.kid}".`,
      'unknown-key',
    )
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`
  if (!verifySignature(signingInput, signature, key)) {
    throw new TrustedForwardingEnvelopeError(
      'Invalid forwarding envelope signature.',
      'invalid-signature',
    )
  }

  const payload = parseJsonPart<TrustedForwardingEnvelopePayload>(encodedPayload, 'payload')
  if (payload.v !== 1 || payload.kid !== header.kid) {
    throw new TrustedForwardingEnvelopeError('Malformed forwarding envelope payload.', 'malformed')
  }
  if (
    typeof payload.issuedAt !== 'number' ||
    !Number.isFinite(payload.issuedAt) ||
    typeof payload.expiresAt !== 'number' ||
    !Number.isFinite(payload.expiresAt)
  ) {
    throw new TrustedForwardingEnvelopeError('Malformed forwarding envelope payload.', 'malformed')
  }
  if (payload.iss !== options.expectedIssuer) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope issuer mismatch.', 'issuer')
  }
  if (payload.aud !== options.expectedAudience) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope audience mismatch.', 'audience')
  }
  if (options.expectedPurpose !== undefined && payload.purpose !== options.expectedPurpose) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope purpose mismatch.', 'purpose')
  }
  if (options.expectedTransport !== undefined && payload.transport !== options.expectedTransport) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope transport mismatch.', 'transport')
  }
  if (options.functionRef !== undefined && payload.functionRef !== options.functionRef) {
    throw new TrustedForwardingEnvelopeError(
      'Forwarding envelope function ref mismatch.',
      'function-ref',
    )
  }
  if (payload.argsHash !== hashForwardingArgs(options.args)) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope args mismatch.', 'args-hash')
  }

  const now = options.now ?? Date.now()
  const skew = options.clockSkewMs ?? 0
  const maxTtlMs = trustedForwardingPurposeMaxTtlsMs[payload.purpose]
  if (maxTtlMs === undefined || payload.expiresAt - payload.issuedAt > maxTtlMs) {
    throw new TrustedForwardingEnvelopeError(
      'Forwarding envelope TTL exceeds purpose maximum.',
      'ttl',
    )
  }
  if (payload.issuedAt > now + skew) {
    throw new TrustedForwardingEnvelopeError(
      'Forwarding envelope is not yet valid.',
      'not-yet-valid',
    )
  }
  if (payload.expiresAt < now - skew) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope expired.', 'expired')
  }
  if (options.redeemJti && !options.redeemJti(payload.jti, payload)) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope replay detected.', 'replayed')
  }

  return payload
}
