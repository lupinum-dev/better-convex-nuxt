import { SignJWT, jwtVerify } from 'jose'

const PURPOSE = 'trellis:tool-confirmation:v1'
const DEFAULT_TTL_SECONDS = 5 * 60

export type ToolConfirmationPayload = {
  v: 1
  operationId: string
  executePath: string
  previewPath: string
  jti: string
  principalKey: string
  tenantKey: string
  argsHash: string
  argsFieldHashes?: Record<string, string>
  previewHash: string
  versionHash?: string
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
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(PURPOSE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(getConfirmationSecret())
}

export async function verifyConfirmationToken(token: string): Promise<ToolConfirmationPayload> {
  const { payload } = await jwtVerify(token, getConfirmationSecret(), {
    audience: PURPOSE,
  })

  return {
    v: 1,
    operationId: String(payload.operationId),
    executePath: String(payload.executePath),
    previewPath: String(payload.previewPath),
    jti: String(payload.jti),
    principalKey: String(payload.principalKey),
    tenantKey: String(payload.tenantKey),
    argsHash: String(payload.argsHash),
    ...(payload.argsFieldHashes &&
    typeof payload.argsFieldHashes === 'object' &&
    !Array.isArray(payload.argsFieldHashes)
      ? {
          argsFieldHashes: Object.fromEntries(
            Object.entries(payload.argsFieldHashes).filter(
              (entry): entry is [string, string] =>
                typeof entry[0] === 'string' && typeof entry[1] === 'string',
            ),
          ),
        }
      : {}),
    previewHash: String(payload.previewHash),
    ...(typeof payload.versionHash === 'string' ? { versionHash: payload.versionHash } : {}),
  }
}
