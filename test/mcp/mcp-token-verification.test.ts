import { beforeAll, describe, expect, it, vi } from 'vitest'

type VerifyMcpAccessToken = (
  token: string,
  options: {
    issuer: string
    requiredScope?: 'mcp:read' | 'mcp:write'
    resource: string
  },
) => Promise<{
  clientId: string
  resource: string
  scopes: ReadonlySet<string>
  sessionId: string
  subject: string
}>

let extractBearerToken: (headers: Headers) => string
let verifyMcpAccessToken: VerifyMcpAccessToken

const issuer = 'https://issuer.example.test/api/auth'
const resource = 'https://issuer.example.test/mcp'
let privateKey: CryptoKey
let publicJwk: JsonWebKey

function base64url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  return Buffer.from(bytes).toString('base64url')
}

async function sign(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: 'mcp-test', typ: 'at+jwt' },
): Promise<string> {
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(input),
  )
  return `${input}.${base64url(new Uint8Array(signature))}`
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000)
  return {
    aud: resource,
    azp: 'client-1',
    client_id: 'client-1',
    exp: now + 300,
    iat: now,
    iss: issuer,
    jti: 'token-1',
    scope: 'mcp:read mcp:write',
    sid: 'session-1',
    sub: 'user-1',
    token_use: 'oauth-access',
    ...overrides,
  }
}

beforeAll(async () => {
  // The root project intentionally excludes standalone starters from its
  // dependency graph. Load the exact source at runtime so the MCP Vitest alias
  // supplies the installed BCN package, while root vue-tsc does not traverse a
  // half-installed starter. Candidate-app and real-backend gates compile the
  // starter with its actual package dependencies.
  const modulePath: string = '../../starters/mcp-oauth-agent/convex/mcp/security'
  const security = (await import(/* @vite-ignore */ modulePath)) as Record<string, unknown>
  if (
    typeof security.extractBearerToken !== 'function' ||
    typeof security.verifyMcpAccessToken !== 'function'
  ) {
    throw new TypeError('MCP security fixture exports are missing')
  }
  extractBearerToken = security.extractBearerToken as (headers: Headers) => string
  verifyMcpAccessToken = security.verifyMcpAccessToken as VerifyMcpAccessToken

  const pair = await crypto.subtle.generateKey(
    {
      hash: 'SHA-256',
      modulusLength: 2048,
      name: 'RSASSA-PKCS1-v1_5',
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ['sign', 'verify'],
  )
  privateKey = pair.privateKey
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  Object.assign(publicJwk, { alg: 'RS256', kid: 'mcp-test', use: 'sig' })

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe(`${issuer}/jwks`)
      return Response.json({ keys: [publicJwk] })
    }),
  )
})

describe('official resource-client MCP token verification', () => {
  it('accepts only the exact issuer/resource/class/client/subject/scope binding', async () => {
    const token = await sign(claims())
    await expect(
      verifyMcpAccessToken(token, { issuer, requiredScope: 'mcp:write', resource }),
    ).resolves.toEqual({
      clientId: 'client-1',
      resource,
      scopes: new Set(['mcp:read', 'mcp:write']),
      sessionId: 'session-1',
      subject: 'user-1',
    })
  })

  it.each([
    ['array audience', () => claims({ aud: [resource] })],
    ['wrong resource', () => claims({ aud: `${resource}/other` })],
    ['wrong issuer', () => claims({ iss: `${issuer}/other` })],
    ['wrong token class', () => claims({ token_use: 'convex-session' })],
    ['client mismatch', () => claims({ azp: 'client-2' })],
    ['raw client mismatch', () => claims({ client_id: 'client-2' })],
    ['missing session', () => claims({ sid: undefined })],
    ['foreign scope', () => claims({ scope: 'mcp:read admin' })],
    ['unknown permission claim', () => claims({ role: 'owner' })],
    ['DPoP confirmation', () => claims({ cnf: { jkt: 'forbidden' } })],
  ])('rejects %s', async (_name, makeClaims) => {
    await expect(
      verifyMcpAccessToken(await sign(makeClaims()), { issuer, resource }),
    ).rejects.toMatchObject({
      code: 'MCP_INVALID_TOKEN',
    })
  })

  it('rejects wrong algorithms and token types at the official verifier', async () => {
    const wrongAlgorithm = await sign(claims(), {
      alg: 'PS256',
      kid: 'mcp-test',
      typ: 'at+jwt',
    })
    const wrongType = await sign(claims(), {
      alg: 'RS256',
      kid: 'mcp-test',
      typ: 'JWT',
    })
    const missingType = await sign(claims(), {
      alg: 'RS256',
      kid: 'mcp-test',
    })
    await expect(verifyMcpAccessToken(wrongAlgorithm, { issuer, resource })).rejects.toMatchObject({
      code: 'MCP_INVALID_TOKEN',
    })
    await expect(verifyMcpAccessToken(wrongType, { issuer, resource })).rejects.toMatchObject({
      code: 'MCP_INVALID_TOKEN',
    })
    await expect(verifyMcpAccessToken(missingType, { issuer, resource })).rejects.toMatchObject({
      code: 'MCP_INVALID_TOKEN',
    })
  })

  it('rejects a same-JWKS Convex session JWT at the official verifier', async () => {
    const now = Math.floor(Date.now() / 1000)
    const sessionToken = await sign(
      {
        aud: 'convex',
        exp: now + 300,
        iat: now,
        iss: 'https://deployment.convex.site',
        sid: 'session-1',
        sub: 'user-1',
        token_use: 'convex-session',
      },
      { alg: 'RS256', kid: 'mcp-test' },
    )

    await expect(verifyMcpAccessToken(sessionToken, { issuer, resource })).rejects.toMatchObject({
      code: 'MCP_INVALID_TOKEN',
    })
  })

  it('accepts bearer credentials only from one strict Authorization header', async () => {
    const token = await sign(claims())
    expect(extractBearerToken(new Headers({ authorization: `Bearer ${token}` }))).toBe(token)
    for (const authorization of [
      '',
      token,
      `bearer ${token}`,
      `Bearer  ${token}`,
      `Bearer ${token}, Bearer ${token}`,
    ]) {
      expect(() => extractBearerToken(new Headers({ authorization }))).toThrowError(
        expect.objectContaining({ code: 'MCP_INVALID_TOKEN' }),
      )
    }
  })
})
