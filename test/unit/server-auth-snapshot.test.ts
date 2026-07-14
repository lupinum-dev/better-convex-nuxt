import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveServerAuthSnapshot } from '../../src/runtime/server/utils/auth-snapshot'

const { fetchWithTimeoutMock, decodeUserFromJwtMock, isJwtUsableMock } = vi.hoisted(() => ({
  fetchWithTimeoutMock: vi.fn(),
  decodeUserFromJwtMock: vi.fn(),
  isJwtUsableMock: vi.fn(),
}))

vi.mock('../../src/runtime/server/utils/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runtime/server/utils/http')>()),
  fetchWithTimeout: fetchWithTimeoutMock,
}))

vi.mock('../../src/runtime/utils/convex-shared', () => ({
  decodeUserFromJwt: decodeUserFromJwtMock,
  isJwtUsable: isJwtUsableMock,
}))

function createResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

const baseOptions = {
  siteUrl: 'https://demo.convex.site',
  requestId: 'request-1',
  trackWaterfall: true,
  throwOnMisconfig: true,
  revealAuthErrorDetails: true,
}

describe('resolveServerAuthSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    decodeUserFromJwtMock.mockReturnValue(null)
    isJwtUsableMock.mockReturnValue(true)
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

  it('exchanges a session cookie for a fresh token on every request', async () => {
    decodeUserFromJwtMock.mockReturnValue({
      id: 'user-2',
      email: 'fresh@example.com',
    })
    fetchWithTimeoutMock.mockResolvedValue(createResponse(200, { token: 'fresh.jwt' }))

    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      cookieHeader:
        'private_app_cookie=secret; __Secure-better-auth.session_token=session-2; better-auth.callback=state',
    })

    expect(snapshot.token).toBe('fresh.jwt')
    expect(snapshot.user).toEqual({ id: 'user-2', email: 'fresh@example.com' })
    expect(snapshot.authError).toBeNull()
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://demo.convex.site/api/auth/convex/token',
      expect.objectContaining({
        headers: {
          Cookie: '__Secure-better-auth.session_token=session-2; better-auth.callback=state',
        },
      }),
    )
  })

  it('logs a truncated user id, never an email, on successful exchange', async () => {
    decodeUserFromJwtMock.mockReturnValue({
      id: 'user-abcdefghijklmnop',
      email: 'private-email@example.com',
    })
    fetchWithTimeoutMock.mockResolvedValue(createResponse(200, { token: 'fresh.jwt' }))

    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      cookieHeader: 'better-auth.session_token=session-log',
    })

    const exchangeEvent = snapshot.logEvents.find(
      (event) => event.phase === 'exchange' && event.outcome === 'success',
    )
    expect(exchangeEvent).toBeDefined()
    expect(exchangeEvent?.details).toEqual({ userId: 'user-abc…' })
    expect(JSON.stringify(exchangeEvent)).not.toContain('example.com')
    expect(JSON.stringify(exchangeEvent)).not.toContain('private-email')
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

  it.each([
    { status: 200, body: {}, label: 'a successful response without a token' },
    { status: 429, body: { error: 'rate limited' }, label: 'an upstream rate limit' },
  ])('fails closed on $label', async ({ status, body }) => {
    fetchWithTimeoutMock.mockResolvedValue(createResponse(status, body))

    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      cookieHeader: 'better-auth.session_token=session-protocol-failure',
    })

    expect(snapshot.token).toBeNull()
    expect(snapshot.user).toBeNull()
    expect(snapshot.authError).toMatch(/convex\/token|token exchange/i)
    expect(snapshot.devError?.message).toMatch(/convex\/token|token exchange/i)
    expect(snapshot.waterfall?.outcome).toBe('error')
    expect(snapshot.logEvents.at(-1)).toMatchObject({
      phase: 'exchange',
      outcome: 'error',
      details: expect.objectContaining({ status }),
    })
    expect(JSON.stringify(snapshot)).not.toContain('session-protocol-failure')
  })

  it('never hydrates an unusable token returned by a successful exchange', async () => {
    isJwtUsableMock.mockReturnValue(false)
    fetchWithTimeoutMock.mockResolvedValue(createResponse(200, { token: 'expired.jwt' }))

    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      cookieHeader: 'better-auth.session_token=session-invalid-jwt',
    })

    expect(snapshot.token).toBeNull()
    expect(snapshot.user).toBeNull()
    expect(snapshot.authError).toMatch(/token exchange/i)
    expect(snapshot.devError?.message).toMatch(/expired or malformed token/i)
    expect(snapshot.waterfall?.outcome).toBe('error')
    expect(decodeUserFromJwtMock).not.toHaveBeenCalled()
    expect(fetchWithTimeoutMock).toHaveBeenCalledOnce()
    expect(String(fetchWithTimeoutMock.mock.calls[0]?.[0])).toMatch(/\/convex\/token$/)
  })

  it('hydrates a generic authError in production while logging the detailed message', async () => {
    fetchWithTimeoutMock.mockResolvedValue(createResponse(500, {}))

    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      throwOnMisconfig: false,
      revealAuthErrorDetails: false,
      cookieHeader: 'better-auth.session_token=session-prod',
    })

    expect(snapshot.token).toBeNull()
    expect(snapshot.authError).toBe('Authentication is temporarily unavailable')
    expect(snapshot.authError).not.toMatch(/BETTER_AUTH_SECRET|convex\/http\.ts|convex\/token/i)
    expect(snapshot.devError).toBeNull()

    // The detailed diagnostic still reaches server-side logs in prod.
    const exchangeLog = snapshot.logEvents.find(
      (event) => event.phase === 'exchange' && event.outcome === 'error',
    )
    expect(String(exchangeLog?.details?.message ?? '')).toMatch(/convex\/token|token exchange/i)
  })

  it('never copies the session credential into structured auth logs', async () => {
    const sessionSecret = 'SESSION_SECRET_MUST_NOT_BE_LOGGED'
    fetchWithTimeoutMock.mockResolvedValue(createResponse(500, {}))

    const snapshot = await resolveServerAuthSnapshot({
      ...baseOptions,
      cookieHeader: `private_app_cookie=also-secret; better-auth.session_token=${sessionSecret}`,
    })

    const serializedLogs = JSON.stringify(snapshot.logEvents)
    expect(serializedLogs).not.toContain(sessionSecret)
    expect(serializedLogs).not.toContain('also-secret')
  })
})
