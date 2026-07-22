import type { Value } from 'convex/values'

import { CanonicalConvexValueError, digestConvexValue } from './canonical-convex'

const ALGORITHM = 'EdDSA'
const TYPE = 'bcn-service-call+jws'
const MAX_COMPACT_LENGTH = 8_192
const MAX_PROOF_LIFETIME_SECONDS = 15
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const textEncoder = new TextEncoder()

const headerKeys = ['alg', 'kid', 'typ'] as const
const claimKeys = [
  'argsDigest',
  'audience',
  'callId',
  'expiresAt',
  'functionName',
  'issuedAt',
  'issuer',
  'keyId',
  'mcp',
  'operation',
  'serviceId',
  'version',
] as const
const mcpKeys = [
  'authorizationReference',
  'clientId',
  'issuer',
  'resource',
  'scopes',
  'subject',
] as const
const authorizationReferenceKeys = ['id', 'kind'] as const

export type ServiceCallOperation = 'action' | 'mutation' | 'query'

export interface ServiceCallProofV1 {
  readonly argsDigest: string
  readonly audience: string
  readonly callId: string
  readonly expiresAt: number
  readonly functionName: string
  readonly issuedAt: number
  readonly issuer: string
  readonly keyId: string
  readonly mcp: {
    readonly authorizationReference: { readonly id: string; readonly kind: string } | null
    readonly clientId: string
    readonly issuer: string
    readonly resource: string
    readonly scopes: readonly string[]
    readonly subject: string
  }
  readonly operation: ServiceCallOperation
  readonly serviceId: string
  readonly version: 1
}

export interface VerifiedServiceCall {
  readonly callId: string
  readonly mcp: {
    readonly clientId: string
    readonly issuer: string
    readonly resource: string
    readonly scopes: readonly string[]
    readonly subject: string
  }
  readonly serviceId: string
}

export interface VerifyServiceCallOptions {
  readonly args: Value
  readonly audience: string
  readonly functionName: string
  readonly issuer: string
  readonly mcpIssuer: string
  readonly mcpResource: string
  readonly nowSeconds: number
  readonly operation: ServiceCallOperation
  readonly publicKeys: Readonly<Record<string, CryptoKey>>
  readonly requiredScope: string
  readonly serviceId: string
}

export class ServiceCallProofError extends Error {
  readonly code = 'EXACT_CALL_PROOF_INVALID'

  constructor() {
    super('Exact-call proof is invalid')
    this.name = 'ServiceCallProofError'
  }
}

function rejectProof(): never {
  throw new ServiceCallProofError()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  )
}

function boundedText(value: unknown, maximum = 256): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) return false
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 32 || code === 127) return false
  }
  return true
}

function identifier(value: unknown): value is string {
  return boundedText(value, 128) && /^(?!_)[\w.:-]+$/u.test(value) && !/[_.:-]$/u.test(value)
}

function keyIdentifier(value: unknown): value is string {
  return boundedText(value, 64) && /^(?!_)[\w.-]+$/u.test(value)
}

function isHttpsUrl(value: unknown): value is string {
  if (!boundedText(value, 1_024)) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' && !url.username && !url.password && !url.hash && url.href === value
    )
  } catch {
    return false
  }
}

function isMcpResourceUrl(value: unknown): value is string {
  if (!boundedText(value, 1_024)) return false
  try {
    const url = new URL(value)
    const loopbackHttp =
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === '::1' || url.hostname === 'localhost')
    return (
      (url.protocol === 'https:' || loopbackHttp) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.href === value
    )
  } catch {
    return false
  }
}

function isSortedScopes(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > 32) return false
  let previous: string | undefined
  for (const scope of value) {
    if (!boundedText(scope, 128) || !/^(?!_)[\w:./-]+$/u.test(scope)) return false
    if (previous !== undefined && previous >= scope) return false
    previous = scope
  }
  return true
}

function parseAuthorizationReference(
  value: unknown,
): ServiceCallProofV1['mcp']['authorizationReference'] | undefined {
  if (value === null) return null
  if (!isRecord(value) || !hasExactKeys(value, authorizationReferenceKeys)) return undefined
  if (!identifier(value.kind) || !boundedText(value.id, 256)) return undefined
  return { id: value.id, kind: value.kind }
}

function parseClaims(value: unknown): ServiceCallProofV1 {
  if (!isRecord(value) || !hasExactKeys(value, claimKeys)) rejectProof()
  if (value.version !== 1) rejectProof()
  if (!identifier(value.issuer) || !identifier(value.audience) || !identifier(value.serviceId)) {
    rejectProof()
  }
  if (!keyIdentifier(value.keyId)) rejectProof()
  if (!boundedText(value.callId, 128) || !/^[\w-]{16,128}$/u.test(value.callId)) {
    rejectProof()
  }
  if (
    typeof value.issuedAt !== 'number' ||
    !Number.isSafeInteger(value.issuedAt) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isSafeInteger(value.expiresAt)
  ) {
    rejectProof()
  }
  if (
    value.operation !== 'query' &&
    value.operation !== 'mutation' &&
    value.operation !== 'action'
  ) {
    rejectProof()
  }
  if (!boundedText(value.functionName, 256) || !/^[\w./-]+:\w+$/u.test(value.functionName)) {
    rejectProof()
  }
  if (typeof value.argsDigest !== 'string' || !/^sha256:[\w-]{43}$/u.test(value.argsDigest)) {
    rejectProof()
  }
  if (!isRecord(value.mcp) || !hasExactKeys(value.mcp, mcpKeys)) rejectProof()
  const authorizationReference = parseAuthorizationReference(value.mcp.authorizationReference)
  if (authorizationReference === undefined) rejectProof()
  if (
    !isHttpsUrl(value.mcp.issuer) ||
    !boundedText(value.mcp.subject, 256) ||
    !boundedText(value.mcp.clientId, 256) ||
    !isMcpResourceUrl(value.mcp.resource) ||
    !isSortedScopes(value.mcp.scopes)
  ) {
    rejectProof()
  }

  return {
    argsDigest: value.argsDigest,
    audience: value.audience,
    callId: value.callId,
    expiresAt: value.expiresAt,
    functionName: value.functionName,
    issuedAt: value.issuedAt,
    issuer: value.issuer,
    keyId: value.keyId,
    mcp: {
      authorizationReference,
      clientId: value.mcp.clientId,
      issuer: value.mcp.issuer,
      resource: value.mcp.resource,
      scopes: Object.freeze([...value.mcp.scopes]),
      subject: value.mcp.subject,
    },
    operation: value.operation,
    serviceId: value.serviceId,
    version: 1,
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!value || value.length % 4 === 1 || !/^[\w-]+$/u.test(value)) rejectProof()
  const base64 =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(base64)
  } catch {
    rejectProof()
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  if (bytesToBase64Url(bytes) !== value) rejectProof()
  return bytes
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(textEncoder.encode(JSON.stringify(value)))
}

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(textDecoder.decode(base64UrlToBytes(value)))
  } catch {
    rejectProof()
  }
}

function assertPrivateSigningKey(key: CryptoKey): void {
  if (key.type !== 'private' || key.algorithm.name !== 'Ed25519' || !key.usages.includes('sign')) {
    rejectProof()
  }
}

export async function signServiceCallProof(
  claims: ServiceCallProofV1,
  privateKey: CryptoKey,
): Promise<string> {
  assertPrivateSigningKey(privateKey)
  const parsed = parseClaims(claims)
  const header = { alg: ALGORITHM, kid: parsed.keyId, typ: TYPE }
  const signingInput = `${encodeJson(header)}.${encodeJson(parsed)}`
  let signature: ArrayBuffer
  try {
    signature = await crypto.subtle.sign('Ed25519', privateKey, textEncoder.encode(signingInput))
  } catch {
    rejectProof()
  }
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`
}

export async function verifyServiceCallProof(
  compact: string,
  options: VerifyServiceCallOptions,
): Promise<VerifiedServiceCall> {
  try {
    if (!compact || compact.length > MAX_COMPACT_LENGTH) rejectProof()
    const segments = compact.split('.')
    if (segments.length !== 3) rejectProof()
    const [encodedHeader, encodedClaims, encodedSignature] = segments
    if (!encodedHeader || !encodedClaims || !encodedSignature) rejectProof()

    const header = decodeJson(encodedHeader)
    if (!isRecord(header) || !hasExactKeys(header, headerKeys)) rejectProof()
    if (header.alg !== ALGORITHM || header.typ !== TYPE || !keyIdentifier(header.kid)) rejectProof()

    const claims = parseClaims(decodeJson(encodedClaims))
    if (header.kid !== claims.keyId) rejectProof()
    const publicKey = options.publicKeys[claims.keyId]
    if (
      !publicKey ||
      publicKey.type !== 'public' ||
      publicKey.algorithm.name !== 'Ed25519' ||
      !publicKey.usages.includes('verify')
    ) {
      rejectProof()
    }
    const verified = await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      base64UrlToBytes(encodedSignature),
      textEncoder.encode(`${encodedHeader}.${encodedClaims}`),
    )
    if (!verified) rejectProof()

    if (
      claims.issuer !== options.issuer ||
      claims.audience !== options.audience ||
      claims.serviceId !== options.serviceId ||
      claims.operation !== options.operation ||
      claims.functionName !== options.functionName ||
      claims.mcp.issuer !== options.mcpIssuer ||
      claims.mcp.resource !== options.mcpResource ||
      !claims.mcp.scopes.includes(options.requiredScope)
    ) {
      rejectProof()
    }
    if (
      claims.issuedAt > options.nowSeconds ||
      claims.expiresAt <= options.nowSeconds ||
      claims.expiresAt <= claims.issuedAt ||
      claims.expiresAt - claims.issuedAt > MAX_PROOF_LIFETIME_SECONDS
    ) {
      rejectProof()
    }

    const expectedDigest = await digestConvexValue(options.args)
    if (claims.argsDigest !== expectedDigest) rejectProof()

    return Object.freeze({
      callId: claims.callId,
      mcp: Object.freeze({
        clientId: claims.mcp.clientId,
        issuer: claims.mcp.issuer,
        resource: claims.mcp.resource,
        scopes: claims.mcp.scopes,
        subject: claims.mcp.subject,
      }),
      serviceId: claims.serviceId,
    })
  } catch (error) {
    if (error instanceof ServiceCallProofError) throw error
    if (error instanceof CanonicalConvexValueError) rejectProof()
    rejectProof()
  }
}

export const serviceCallProofLimits = Object.freeze({
  maximumCompactLength: MAX_COMPACT_LENGTH,
  maximumLifetimeSeconds: MAX_PROOF_LIFETIME_SECONDS,
})
