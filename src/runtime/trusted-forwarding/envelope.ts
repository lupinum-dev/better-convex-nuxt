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
  readonly functionRef: string
  readonly args: unknown
  readonly now?: number
  readonly clockSkewMs?: number
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
      | 'function-ref'
      | 'args-hash'
      | 'expired'
      | 'not-yet-valid'
      | 'replayed',
  ) {
    super(message)
    this.name = 'TrustedForwardingEnvelopeError'
  }
}

const headerType = 'trellis-forwarding+jws'
const excludedArgsKeys = new Set(['_trellisForwarding', '__trellis'])

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

function canonicalJson(value: unknown, options: { omitReservedArgsKeys?: boolean } = {}): string {
  if (value === null) return 'null'

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry ?? null, options)).join(',')}]`
  }

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return JSON.stringify(value)
    case 'undefined':
      return 'null'
    case 'object': {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key, entry]) => {
          if (entry === undefined) return false
          return !(options.omitReservedArgsKeys && excludedArgsKeys.has(key))
        })
        .sort(([left], [right]) => left.localeCompare(right))

      return `{${entries
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry, options)}`)
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
  return canonicalJson(args, { omitReservedArgsKeys: true })
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
  if (payload.iss !== options.expectedIssuer) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope issuer mismatch.', 'issuer')
  }
  if (payload.aud !== options.expectedAudience) {
    throw new TrustedForwardingEnvelopeError('Forwarding envelope audience mismatch.', 'audience')
  }
  if (payload.functionRef !== options.functionRef) {
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
