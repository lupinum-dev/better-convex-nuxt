import { betterAuth } from 'better-auth'
import { memoryAdapter, type MemoryDB } from 'better-auth/adapters/memory'
import { jwt } from 'better-auth/plugins'
import { describe, expect, it } from 'vitest'

import { INTERNAL_SESSION_HEADER } from '../../src/runtime/convex-auth/internal-session'
import { convexAuth } from '../../src/runtime/convex-auth/plugin'

const origin = 'https://app.example.test'
const convexSiteUrl = 'https://deployment.convex.site'
const secret = 'internal-session-test-secret-with-at-least-32-randomish-characters'
const sessionToken = 'persisted-session-token'

function createAuth() {
  const now = Date.now()
  const database: MemoryDB = {
    rateLimit: [],
    session: [
      {
        createdAt: new Date(now - 1_000),
        expiresAt: new Date(now + 60_000),
        id: 'session-1',
        ipAddress: null,
        token: sessionToken,
        updatedAt: new Date(now - 1_000),
        userAgent: null,
        userId: 'user-1',
      },
    ],
    user: [
      {
        createdAt: new Date(now - 1_000),
        email: 'user@example.test',
        emailVerified: true,
        id: 'user-1',
        image: null,
        name: 'Test User',
        updatedAt: new Date(now - 1_000),
      },
    ],
  }
  const issuer = `${origin}/api/auth`
  return betterAuth({
    advanced: { ipAddress: { ipAddressHeaders: ['x-bcn-verified-client-ip'] } },
    basePath: '/api/auth',
    baseURL: origin,
    database: memoryAdapter(database),
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwks: {
          disablePrivateKeyEncryption: false,
          gracePeriod: 21 * 60,
          keyPairConfig: { alg: 'RS256' },
        },
        jwt: { audience: issuer, expirationTime: '10m', issuer },
      }),
      convexAuth({
        authConfig: {
          providers: [
            {
              algorithm: 'RS256',
              applicationID: 'convex',
              issuer: convexSiteUrl,
              jwks: `${issuer}/jwks`,
              type: 'customJwt',
            },
          ],
        },
        sessionJwt: {
          audience: 'convex',
          expirationTime: '15m',
          issuer: convexSiteUrl,
        },
      }),
    ],
    rateLimit: { enabled: true, modelName: 'rateLimit', storage: 'database' },
    secret,
  })
}

function request(marker: boolean): Request {
  return new Request(`${origin}/api/auth/get-session`, {
    headers: {
      authorization: `Bearer ${sessionToken}`,
      ...(marker ? { [INTERNAL_SESSION_HEADER]: '1' } : {}),
    },
  })
}

describe('internal Better Auth session bridge', () => {
  it('authenticates a package-owned in-process call with the persisted session token', async () => {
    const response = await createAuth().handler(request(true))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      session: { id: 'session-1', token: sessionToken },
      user: { id: 'user-1' },
    })
    expect(response.headers.has('set-auth-token')).toBe(false)
  })

  it('does not expose bearer-session authentication without the stripped internal marker', async () => {
    const response = await createAuth().handler(request(false))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toBeNull()
    expect(response.headers.has('set-auth-token')).toBe(false)
  })
})
