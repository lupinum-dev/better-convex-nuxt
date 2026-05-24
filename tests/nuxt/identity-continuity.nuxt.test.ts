import { afterEach, describe, expect, it } from 'vitest'

import {
  createAuthHarness,
  createMockTokenExchange,
  mintExpiredJwt,
  TEST_USERS,
} from '../support/auth'

let h: Awaited<ReturnType<typeof createAuthHarness>>

afterEach(() => h?.dispose())

describe('Auth Identity Continuity', () => {
  it('uses the hydrated SSR identity without emitting trellis:auth:changed', async () => {
    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
    })

    expect(h.isAuthenticated.value).toBe(true)
    expect(h.pending.value).toBe(false)
    expect(h.user.value?.email).toBe('alice@test.com')
    expect(h.authChangedSpy).not.toHaveBeenCalled()
  })

  it('refreshes from a stale hydrated identity to the current session identity', async () => {
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
    expect(h.authChangedSpy).toHaveBeenCalledTimes(1)
    expect(h.authChangedSpy).toHaveBeenCalledWith({
      isAuthenticated: true,
      previousIsAuthenticated: true,
      sessionUser: expect.objectContaining({ email: 'bob@test.com' }),
      previousSessionUser: expect.objectContaining({ email: 'alice@test.com' }),
    })
  })

  it('re-exchanges an expired hydrated token instead of trusting it', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithPayload(TEST_USERS.alice.payload)

    h = await createAuthHarness({
      initialToken: mintExpiredJwt(TEST_USERS.alice.payload),
      initialUser: TEST_USERS.alice.user,
      tokenExchange: exchange,
    })

    await h.triggerRefresh()

    expect(h.isAuthenticated.value).toBe(true)
    expect(h.pending.value).toBe(false)
    expect(h.user.value?.email).toBe('alice@test.com')
    expect(exchange.callCount).toBe(1)
  })

  it('stays unauthenticated when no hydrated auth state exists', async () => {
    const exchange = createMockTokenExchange()

    h = await createAuthHarness({
      initialToken: null,
      initialUser: null,
      tokenExchange: exchange,
    })

    expect(h.isAuthenticated.value).toBe(false)
    expect(exchange.callCount).toBe(0)
  })

  it('becomes authenticated on client refresh after sign-in', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithPayload(TEST_USERS.alice.payload)

    h = await createAuthHarness({
      tokenExchange: exchange,
    })

    await h.triggerRefresh()

    expect(h.isAuthenticated.value).toBe(true)
    expect(h.pending.value).toBe(false)
    expect(h.user.value?.email).toBe('alice@test.com')
    expect(h.rawAuthError.value).toBeNull()
    expect(h.authChangedSpy).toHaveBeenCalledWith({
      isAuthenticated: true,
      previousIsAuthenticated: false,
      sessionUser: expect.objectContaining({ email: 'alice@test.com' }),
      previousSessionUser: null,
    })
  })

  it('signOut clears auth state and emits a single de-auth transition', async () => {
    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
    })

    await h.triggerSignOut()

    expect(h.isAuthenticated.value).toBe(false)
    expect(h.pending.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.user.value).toBeNull()
    expect(h.rawAuthError.value).toBeNull()
    expect(h.invalidateHandlerSpy).toHaveBeenCalledTimes(1)
    expect(h.signOutSpy).toHaveBeenCalledTimes(1)
    expect(h.authChangedSpy).toHaveBeenCalledWith({
      isAuthenticated: false,
      previousIsAuthenticated: true,
      sessionUser: null,
      previousSessionUser: expect.objectContaining({ email: 'alice@test.com' }),
    })
  })

  it('signOut still fails closed before surfacing the upstream error', async () => {
    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      signOutBehavior: 'fail',
    })

    await expect(h.triggerSignOut()).rejects.toThrow('Upstream signOut failed')

    expect(h.isAuthenticated.value).toBe(false)
    expect(h.pending.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.user.value).toBeNull()
    expect(h.rawAuthError.value).toMatch(/Upstream signOut failed/)
    expect(h.invalidateHandlerSpy).toHaveBeenCalledTimes(1)
    expect(h.signOutSpy).toHaveBeenCalledTimes(1)
  })
})
