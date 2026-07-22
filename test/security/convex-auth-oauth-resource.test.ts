import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createBetterAuthMcpAccessVerifier,
  verifyOAuthBearerToken,
} from '../../src/runtime/convex-auth/oauth-resource'

const { verifyBearerToken } = vi.hoisted(() => ({ verifyBearerToken: vi.fn() }))

vi.mock('@better-auth/oauth-provider/resource-client', () => ({
  oauthProviderResourceClient: () => ({
    getActions: () => ({ verifyBearerToken }),
  }),
}))

const issuer = 'https://app.example.test/api/auth'
const audience = 'https://app.example.test/mcp'

function compactToken(overrides: Record<string, unknown> = {}): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256', typ: 'at+jwt' })}.${encode({
    aud: audience,
    azp: 'client-1',
    client_id: 'client-1',
    exp: 1600,
    iat: 1000,
    iss: issuer,
    jti: 'token-1',
    scope: 'mcp:read',
    sid: 'session-1',
    sub: 'user-1',
    token_use: 'oauth-access',
    ...overrides,
  })}.signature`
}

describe('official OAuth resource-client integration', () => {
  beforeEach(() => {
    verifyBearerToken.mockReset()
    verifyBearerToken.mockResolvedValue({
      aud: audience,
      azp: 'client-1',
      client_id: 'client-1',
      exp: 1600,
      iat: 1000,
      iss: issuer,
      jti: 'token-1',
      scope: 'mcp:read',
      sid: 'session-1',
      sub: 'user-1',
      token_use: 'oauth-access',
    })
  })

  it('delegates JOSE/JWKS verification with exact RS256, at+jwt, issuer and audience', async () => {
    await expect(
      verifyOAuthBearerToken(compactToken(), {
        allowedScopes: ['mcp:read', 'mcp:write'],
        audience,
        clientId: 'client-1',
        issuer,
        jwksUrl: `${issuer}/jwks`,
        nowSeconds: 1200,
        requiredScopes: ['mcp:read'],
        subject: 'user-1',
      }),
    ).resolves.toEqual({
      clientId: 'client-1',
      expiresAt: 1600,
      issuedAt: 1000,
      scopes: ['mcp:read'],
      sessionId: 'session-1',
      subject: 'user-1',
    })

    expect(verifyBearerToken).toHaveBeenCalledWith(compactToken(), {
      jwksUrl: `${issuer}/jwks`,
      verifyOptions: {
        algorithms: ['RS256'],
        audience,
        clockTolerance: 0,
        currentDate: new Date(1200 * 1000),
        issuer,
        maxTokenAge: '600s',
        typ: 'at+jwt',
      },
    })
  })

  it('adapts the strict verifier to a resource-bound MCP identity without provider-private state', async () => {
    const now = Math.floor(Date.now() / 1000)
    const allowedScopes = ['mcp:read']
    const requiredScopes = ['mcp:read']
    const verifier = createBetterAuthMcpAccessVerifier({
      allowedScopes,
      issuer,
      jwksUrl: `${issuer}/jwks`,
      requiredScopes,
    })
    allowedScopes.push('attacker:scope')
    requiredScopes[0] = 'attacker:scope'

    const token = compactToken({ exp: now + 300, iat: now - 10 })
    await expect(verifier.verifyAccessToken(token, new URL(audience))).resolves.toEqual({
      access: {
        clientId: 'client-1',
        issuer,
        resource: audience,
        scopes: ['mcp:read'],
        subject: 'user-1',
      },
      expiresAt: now + 300,
    })

    const result = await verifier.verifyAccessToken(token, new URL(audience))
    expect(result).not.toHaveProperty('sessionId')
    expect(result.access).not.toHaveProperty('sessionId')
    expect(result).not.toHaveProperty('token')
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.access)).toBe(true)
    expect(Object.isFrozen(result.access.scopes)).toBe(true)
    expect(verifyBearerToken).toHaveBeenLastCalledWith(token, {
      jwksUrl: `${issuer}/jwks`,
      verifyOptions: {
        algorithms: ['RS256'],
        audience,
        clockTolerance: 0,
        currentDate: undefined,
        issuer,
        maxTokenAge: '600s',
        typ: 'at+jwt',
      },
    })
  })

  it.each([
    ['Convex session token class', { token_use: 'convex-session' }],
    ['missing token class', { token_use: undefined }],
    ['foreign issuer', { iss: 'https://foreign.example.test/api/auth' }],
    ['foreign resource', { aud: 'https://other.example.test/mcp' }],
    ['array audience', { aud: [audience] }],
    ['conflicting client identity', { client_id: 'attacker-client' }],
  ])('rejects %s through the Better Auth MCP adapter', async (_label, overrides) => {
    const now = Math.floor(Date.now() / 1000)
    const verifier = createBetterAuthMcpAccessVerifier({
      allowedScopes: ['mcp:read'],
      issuer,
      jwksUrl: `${issuer}/jwks`,
    })

    await expect(
      verifier.verifyAccessToken(
        compactToken({ exp: now + 300, iat: now - 10, ...overrides }),
        new URL(audience),
      ),
    ).rejects.toThrow('AUTH_OAUTH_TOKEN_INVALID')
  })

  it('rejects expired and malformed tokens through the Better Auth MCP adapter', async () => {
    const now = Math.floor(Date.now() / 1000)
    const verifier = createBetterAuthMcpAccessVerifier({
      allowedScopes: ['mcp:read'],
      issuer,
      jwksUrl: `${issuer}/jwks`,
    })

    await expect(
      verifier.verifyAccessToken(compactToken({ exp: now - 1, iat: now - 100 }), new URL(audience)),
    ).rejects.toThrow('AUTH_OAUTH_TOKEN_INVALID')
    await expect(verifier.verifyAccessToken('not-a-jwt', new URL(audience))).rejects.toThrow(
      'AUTH_OAUTH_TOKEN_INVALID',
    )
  })

  it.each([
    'http://app.example.test/mcp',
    'https://user@app.example.test/mcp',
    'https://app.example.test/mcp#fragment',
  ])('rejects an unsafe expected MCP resource before token verification: %s', async (resource) => {
    const verifier = createBetterAuthMcpAccessVerifier({
      allowedScopes: ['mcp:read'],
      issuer,
      jwksUrl: `${issuer}/jwks`,
    })

    await expect(verifier.verifyAccessToken(compactToken(), new URL(resource))).rejects.toThrow(
      'AUTH_OAUTH_TOKEN_INVALID',
    )
    expect(verifyBearerToken).not.toHaveBeenCalled()
  })

  it('installs URL.canParse at the isolated resource-verification boundary', async () => {
    const original = URL.canParse
    try {
      Object.defineProperty(URL, 'canParse', {
        configurable: true,
        value: undefined,
        writable: true,
      })
      await verifyOAuthBearerToken(compactToken(), {
        allowedScopes: ['mcp:read'],
        audience,
        issuer,
        jwksUrl: `${issuer}/jwks`,
        nowSeconds: 1200,
      })
      expect(URL.canParse).toBeTypeOf('function')
    } finally {
      Object.defineProperty(URL, 'canParse', {
        configurable: true,
        value: original,
        writable: true,
      })
    }
  })

  it('rejects a signed raw client_id conflict hidden by the pinned verifier normalization', async () => {
    verifyBearerToken.mockResolvedValue({
      aud: audience,
      azp: 'client-1',
      client_id: 'client-1',
      exp: 1600,
      iat: 1000,
      iss: issuer,
      jti: 'token-1',
      scope: 'mcp:read',
      sid: 'session-1',
      sub: 'user-1',
      token_use: 'oauth-access',
    })

    await expect(
      verifyOAuthBearerToken(compactToken({ client_id: 'attacker-client' }), {
        allowedScopes: ['mcp:read'],
        audience,
        clientId: 'client-1',
        issuer,
        jwksUrl: `${issuer}/jwks`,
        nowSeconds: 1200,
      }),
    ).rejects.toThrow('AUTH_OAUTH_TOKEN_INVALID')
  })

  it('rejects malformed compact input before any JWKS work', async () => {
    await expect(
      verifyOAuthBearerToken('not-a-jwt', {
        allowedScopes: ['mcp:read'],
        audience,
        issuer,
        jwksUrl: `${issuer}/jwks`,
      }),
    ).rejects.toThrow('AUTH_OAUTH_TOKEN_INVALID')
    expect(verifyBearerToken).not.toHaveBeenCalled()
  })

  it.each(['https://evil.example/jwks', `${issuer}/other-jwks`, `${issuer}/jwks#fragment`])(
    'rejects a noncanonical JWKS location before crypto processing: %s',
    async (jwksUrl) => {
      await expect(
        verifyOAuthBearerToken('access-token', {
          allowedScopes: ['mcp:read'],
          audience,
          issuer,
          jwksUrl,
          nowSeconds: 1200,
        }),
      ).rejects.toThrow('AUTH_OAUTH_TOKEN_INVALID')
      expect(verifyBearerToken).not.toHaveBeenCalled()
    },
  )
})
