import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveServerAuthSnapshot } from '../../src/runtime/server/utils/auth-snapshot'

const {
  fetchWithTimeoutMock,
  getCachedAuthTokenMock,
  setCachedAuthTokenMock,
  decodeUserFromJwtMock,
} = vi.hoisted(() => ({
  fetchWithTimeoutMock: vi.fn(),
  getCachedAuthTokenMock: vi.fn(),
  setCachedAuthTokenMock: vi.fn(),
  decodeUserFromJwtMock: vi.fn(),
}))

vi.mock('../../src/runtime/server/utils/http', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}))

vi.mock('../../src/runtime/server/utils/auth-cache', () => ({
  getCachedAuthToken: getCachedAuthTokenMock,
  setCachedAuthToken: setCachedAuthTokenMock,
}))

vi.mock('../../src/runtime/utils/convex-shared', () => ({
  decodeUserFromJwt: decodeUserFromJwtMock,
}))

function createResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

const baseOptions = {
  siteUrl: 'https://demo.convex.site',
  requestId: 'request-1',
  trackWaterfall: true,
  throwOnMisconfig: true,
  authCache: { enabled: false, ttl: 60 },
}

describe('resolveServerAuthSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCachedAuthTokenMock.mockResolvedValue(null)
    setCachedAuthTokenMock.mockResolvedValue(undefined)
    decodeUserFromJwtMock.mockReturnValue(null)
  })

  it('returns an unauthenticated snapshot without a session cookie', async () => {
    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      cookieHeader: null,
    })

    expect(snapshot.token).toBeNull()
    expect(snapshot.user).toBeNull()
    expect(snapshot.authError).toBeNull()
    expect(snapshot.devError).toBeNull()
    expect(snapshot.waterfall?.outcome).toBe('unauthenticated')
    expect(snapshot.logEvents.map((event) => [event.phase, event.outcome])).toEqual([
      ['server-init', 'success'],
      ['session-check', 'miss'],
    ])
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
  })

  it('uses a cached token and decoded user without token exchange', async () => {
    getCachedAuthTokenMock.mockResolvedValue('cached.jwt')
    decodeUserFromJwtMock.mockReturnValue({
      id: 'user-1',
      email: 'cached@example.com',
    })

    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      authCache: { enabled: true, ttl: 30 },
      cookieHeader: 'better-auth.session_token=session-1',
    })

    expect(snapshot.token).toBe('cached.jwt')
    expect(snapshot.user).toEqual({ id: 'user-1', email: 'cached@example.com' })
    expect(snapshot.authError).toBeNull()
    expect(snapshot.waterfall?.cacheHit).toBe(true)
    expect(snapshot.logEvents.at(-1)).toEqual({
      phase: 'cache',
      outcome: 'success',
      details: { source: 'cache' },
    })
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
  })

  it('exchanges a session cookie for a token and stores it when cache is enabled', async () => {
    decodeUserFromJwtMock.mockReturnValue({
      id: 'user-2',
      email: 'fresh@example.com',
    })
    fetchWithTimeoutMock.mockResolvedValue(createResponse(200, { token: 'fresh.jwt' }))

    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      authCache: { enabled: true, ttl: 45 },
      cookieHeader: '__Secure-better-auth.session_token=session-2',
    })

    expect(snapshot.token).toBe('fresh.jwt')
    expect(snapshot.user).toEqual({ id: 'user-2', email: 'fresh@example.com' })
    expect(snapshot.authError).toBeNull()
    expect(setCachedAuthTokenMock).toHaveBeenCalledWith('session-2', 'fresh.jwt', 45)
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://demo.convex.site/api/auth/convex/token',
      expect.objectContaining({
        headers: { Cookie: '__Secure-better-auth.session_token=session-2' },
      }),
    )
  })

  it('treats 401 token exchange as graceful unauthenticated state', async () => {
    fetchWithTimeoutMock.mockResolvedValue(createResponse(401, { error: 'unauthorized' }))

    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      cookieHeader: 'better-auth.session_token=session-3',
    })

    expect(snapshot.token).toBeNull()
    expect(snapshot.user).toBeNull()
    expect(snapshot.authError).toBeNull()
    expect(snapshot.devError).toBeNull()
    expect(snapshot.waterfall?.outcome).toBe('unauthenticated')
    expect(snapshot.logEvents.at(-1)).toMatchObject({
      phase: 'exchange',
      outcome: 'miss',
      details: { status: 401 },
    })
  })

  it('marks upstream token exchange failures as misconfiguration', async () => {
    fetchWithTimeoutMock.mockResolvedValue(createResponse(500, {}))

    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      cookieHeader: 'better-auth.session_token=session-4',
    })

    expect(snapshot.token).toBeNull()
    expect(snapshot.user).toBeNull()
    expect(snapshot.authError).toMatch(/convex\/token|token exchange/i)
    expect(snapshot.devError?.message).toMatch(/convex\/token|token exchange/i)
    expect(snapshot.waterfall?.outcome).toBe('error')
    expect(snapshot.logEvents.at(-1)).toMatchObject({
      phase: 'exchange',
      outcome: 'error',
      details: { status: 500 },
    })
  })
})
