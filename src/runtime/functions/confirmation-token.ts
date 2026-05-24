const OPAQUE_TOKEN_PREFIX = 'trellis-confirm-v1.'

export type ToolConfirmationPayload = {
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

export type StoredToolConfirmationPayload = ToolConfirmationPayload & {
  tokenHash: string
  createdAt: number
  expiresAt: number
  redeemedAt?: number
}

export type StoredToolConfirmationRow = StoredToolConfirmationPayload & {
  _id?: unknown
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

function randomSegment(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

export function createConfirmationToken(): string {
  return `${OPAQUE_TOKEN_PREFIX}${randomSegment()}${randomSegment()}`
}

export async function hashConfirmationValue(value: unknown): Promise<string> {
  const payload = JSON.stringify(canonicalize(value))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return toHex(new Uint8Array(digest))
}

export async function hashConfirmationToken(token: string): Promise<string> {
  return await hashConfirmationValue({ token })
}

export function normalizeStoredConfirmationPayload(row: unknown): StoredToolConfirmationRow | null {
  if (!row || typeof row !== 'object') return null
  const value = row as Record<string, unknown>
  if (
    typeof value.operationId !== 'string' ||
    typeof value.executePath !== 'string' ||
    typeof value.previewPath !== 'string' ||
    typeof value.jti !== 'string' ||
    typeof value.callerKey !== 'string' ||
    typeof value.scopeKey !== 'string' ||
    typeof value.argsHash !== 'string' ||
    typeof value.previewHash !== 'string' ||
    typeof value.tokenHash !== 'string' ||
    typeof value.createdAt !== 'number' ||
    typeof value.expiresAt !== 'number'
  ) {
    return null
  }

  return {
    ...(value._id === undefined ? {} : { _id: value._id }),
    operationId: value.operationId,
    executePath: value.executePath,
    previewPath: value.previewPath,
    jti: value.jti,
    callerKey: value.callerKey,
    scopeKey: value.scopeKey,
    argsHash: value.argsHash,
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
    previewHash: value.previewHash,
    ...(typeof value.versionHash === 'string' ? { versionHash: value.versionHash } : {}),
    tokenHash: value.tokenHash,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    ...(typeof value.redeemedAt === 'number' ? { redeemedAt: value.redeemedAt } : {}),
  }
}
