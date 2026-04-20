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
    previewHash: String(payload.previewHash),
    ...(typeof payload.versionHash === 'string' ? { versionHash: payload.versionHash } : {}),
  }
}
