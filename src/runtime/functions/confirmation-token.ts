import { SignJWT, jwtVerify } from 'jose'

const PURPOSE = 'trellis:tool-confirmation:v1'
const UNSIGNED_TOKEN_PREFIX = 'trellis-unsigned-v1.'
const DEFAULT_TTL_SECONDS = 5 * 60

export type ToolConfirmationPayload = {
  v: 1
  operationId: string
  executePath: string
  previewPath: string
  jti: string
  callerKey: string
  scopeKey: string
  argsHash: string
  argsFieldHashes?: Record<string, string>
  previewHash: string
  versionHash?: string
}

export type ToolConfirmationTokenMode = 'signed' | 'unsigned'

type ToolConfirmationTokenOptions = {
  mode?: ToolConfirmationTokenMode
}

function getConfirmationSecret(): Uint8Array {
  const secret = process.env.TRELLIS_MCP_CONFIRMATION_KEY?.trim()
  if (!secret) {
    throw new Error(
      'Trellis destructive MCP confirmation requires TRELLIS_MCP_CONFIRMATION_KEY to be set.',
    )
  }

  return new TextEncoder().encode(`${PURPOSE}:${secret}`)
}

function encodeUnsignedToken(payload: ToolConfirmationPayload, ttlSeconds: number): string {
  const envelope = {
    aud: PURPOSE,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    iat: Math.floor(Date.now() / 1000),
    payload,
  }
  const json = JSON.stringify(envelope)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `${UNSIGNED_TOKEN_PREFIX}${btoa(binary)}`
}

function decodeUnsignedToken(token: string): ToolConfirmationPayload {
  if (!token.startsWith(UNSIGNED_TOKEN_PREFIX)) {
    throw new Error('Unsigned confirmation token has an invalid prefix.')
  }
  const encoded = token.slice(UNSIGNED_TOKEN_PREFIX.length)
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  const envelope = JSON.parse(new TextDecoder().decode(bytes)) as {
    aud?: unknown
    exp?: unknown
    payload?: unknown
  }
  if (envelope.aud !== PURPOSE) {
    throw new Error('Unsigned confirmation token has an invalid audience.')
  }
  if (typeof envelope.exp !== 'number' || envelope.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Unsigned confirmation token has expired.')
  }
  return normalizeConfirmationPayload(envelope.payload)
}

function normalizeConfirmationPayload(payload: unknown): ToolConfirmationPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Confirmation token payload is invalid.')
  }
  const value = payload as Record<string, unknown>
  return {
    v: 1,
    operationId: String(value.operationId),
    executePath: String(value.executePath),
    previewPath: String(value.previewPath),
    jti: String(value.jti),
    callerKey: String(value.callerKey),
    scopeKey: String(value.scopeKey),
    argsHash: String(value.argsHash),
    ...(value.argsFieldHashes &&
    typeof value.argsFieldHashes === 'object' &&
    !Array.isArray(value.argsFieldHashes)
      ? {
          argsFieldHashes: Object.fromEntries(
            Object.entries(value.argsFieldHashes).filter(
              (entry): entry is [string, string] =>
                typeof entry[0] === 'string' && typeof entry[1] === 'string',
            ),
          ),
        }
      : {}),
    previewHash: String(value.previewHash),
    ...(typeof value.versionHash === 'string' ? { versionHash: value.versionHash } : {}),
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item))
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, canonicalize(entryValue)])
    return Object.fromEntries(entries)
  }
  return value
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashConfirmationValue(value: unknown): Promise<string> {
  const payload = JSON.stringify(canonicalize(value))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return toHex(new Uint8Array(digest))
}

export async function signConfirmationToken(
  payload: ToolConfirmationPayload,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  options: ToolConfirmationTokenOptions = {},
): Promise<string> {
  if (options.mode === 'unsigned') {
    return encodeUnsignedToken(payload, ttlSeconds)
  }
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(PURPOSE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(getConfirmationSecret())
}

export async function verifyConfirmationToken(
  token: string,
  options: ToolConfirmationTokenOptions = {},
): Promise<ToolConfirmationPayload> {
  if (token.startsWith(UNSIGNED_TOKEN_PREFIX)) {
    if (options.mode !== 'unsigned') {
      throw new Error('Unsigned confirmation tokens are not accepted by this operation.')
    }
    return decodeUnsignedToken(token)
  }
  const { payload } = await jwtVerify(token, getConfirmationSecret(), {
    audience: PURPOSE,
  })

  return normalizeConfirmationPayload(payload)
}
