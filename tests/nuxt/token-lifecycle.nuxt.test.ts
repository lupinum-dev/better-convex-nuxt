import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getJwtTimeUntilExpiryMs } from '../../src/runtime/convex/shared/convex-shared'
import {
  AUTH_REFRESH_TIMEOUT_MS,
  TOKEN_EXPIRY_SAFETY_BUFFER_MS,
} from '../../src/runtime/utils/constants'
import {
  createAuthHarness,
  createMockTokenExchange,
  mintJwtExpiringIn,
  TEST_USERS,
} from '../support/auth'

let h: Awaited<ReturnType<typeof createAuthHarness>>

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
  h?.dispose()
})

describe('Auth Token Lifecycle', () => {
  it('treats tokens inside the safety buffer as no longer safe to reuse', () => {
    const token = mintJwtExpiringIn(TEST_USERS.alice.payload, 25_000)
    const remaining = getJwtTimeUntilExpiryMs(token)

    expect(remaining).not.toBeNull()
    expect(remaining!).toBeLessThan(TOKEN_EXPIRY_SAFETY_BUFFER_MS)
  })

  it('treats tokens outside the safety buffer as reusable', () => {
    const token = mintJwtExpiringIn(TEST_USERS.alice.payload, 300_000)
    const remaining = getJwtTimeUntilExpiryMs(token)

    expect(remaining).not.toBeNull()
    expect(remaining!).toBeGreaterThan(TOKEN_EXPIRY_SAFETY_BUFFER_MS)
  })

  it('refreshes to a new identity when the exchange returns a fresh token', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithPayload(TEST_USERS.bob.payload)

    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      tokenExchange: exchange,
    })

    await h.triggerRefresh()

    expect(h.isAuthenticated.value).toBe(true)
    expect(h.pending.value).toBe(false)
    expect(h.user.value?.email).toBe('bob@test.com')
    expect(exchange.callCount).toBe(1)
  })

  it('invalidate clears token, user, and auth error', async () => {
    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      initialAuthError: 'stale error',
    })

    await h.triggerInvalidate()

    expect(h.isAuthenticated.value).toBe(false)
    expect(h.pending.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.user.value).toBeNull()
    expect(h.rawAuthError.value).toBeNull()
  })

  it('settles anonymous when refresh completes without a token', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithMiss()

    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      tokenExchange: exchange,
    })

    await expect(h.triggerRefresh()).resolves.toBeUndefined()
    expect(h.isAuthenticated.value).toBe(false)
    expect(h.isAnonymous.value).toBe(true)
    expect(h.pending.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.user.value).toBeNull()
    expect(h.rawAuthError.value).toBeNull()
  })

  it('fails closed when refresh returns an invalid JWT that cannot be decoded', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithToken('not-a-valid.jwt')

    h = await createAuthHarness({ tokenExchange: exchange })

    await expect(h.triggerRefresh()).rejects.toThrow(/invalid auth token/i)
    expect(h.isAuthenticated.value).toBe(false)
    expect(h.pending.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.user.value).toBeNull()
    expect(h.rawAuthError.value).toMatch(/invalid auth token/i)
  })

  it('times out a hung refresh without leaving a stray warning after a later success', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const exchange = createMockTokenExchange()
    exchange.enqueue(
      {
        data: { token: TEST_USERS.alice.token },
        error: null,
        delayMs: AUTH_REFRESH_TIMEOUT_MS + 100,
      },
      {
        data: { token: TEST_USERS.bob.token },
        error: null,
      },
    )

    h = await createAuthHarness({ tokenExchange: exchange })

    try {
      vi.useFakeTimers()

      const timedOutRefresh = expect(h.triggerRefresh()).rejects.toThrow(/timed out/i)
      await vi.advanceTimersByTimeAsync(AUTH_REFRESH_TIMEOUT_MS)
      await timedOutRefresh

      expect(h.isAuthenticated.value).toBe(false)
      expect(h.pending.value).toBe(false)
      expect(h.token.value).toBeNull()
      expect(h.user.value).toBeNull()

      warnSpy.mockClear()

      const successfulRefresh = h.triggerRefresh()
      await vi.advanceTimersByTimeAsync(200)
      await expect(successfulRefresh).resolves.toBeUndefined()

      expect(h.isAuthenticated.value).toBe(true)
      expect(h.pending.value).toBe(false)
      expect(h.user.value?.email).toBe('bob@test.com')

      await vi.advanceTimersByTimeAsync(AUTH_REFRESH_TIMEOUT_MS + 100)
      expect(warnSpy).toHaveBeenCalledTimes(0)
    } finally {
      warnSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('marks a lost authenticated session as expired but keeps explicit sign-out non-expired', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithMiss()

    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      tokenExchange: exchange,
    })

    expect(h.isSessionExpired.value).toBe(false)

    await expect(h.triggerRefresh()).resolves.toBeUndefined()
    expect(h.isSessionExpired.value).toBe(true)

    h.dispose()

    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
    })

    await h.triggerSignOut()
    expect(h.isSessionExpired.value).toBe(false)
  })
})
