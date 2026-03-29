import { afterEach, describe, expect, it } from 'vitest'

import {
  createAuthHarness,
  createMockTokenExchange,
  mintExpiredJwt,
  TEST_USERS,
} from '../harness'

let h: Awaited<ReturnType<typeof createAuthHarness>>

afterEach(() => h?.dispose())

describe('Auth Identity Continuity', () => {
  it('uses the hydrated SSR identity without emitting convex:auth:changed', async () => {
    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
    })

    h.assertAuthenticated('user-alice')
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

    h.assertAuthenticated('user-bob')
    expect(h.authChangedSpy.mock.calls.length).toBeGreaterThan(0)
    expect(h.authChangedSpy.mock.calls.at(-1)?.[0]).toEqual({
      isAuthenticated: true,
      previousIsAuthenticated: false,
      user: expect.objectContaining({ id: 'user-bob' }),
      previousUser: null,
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

    h.assertAuthenticated('user-alice')
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

    h.assertAuthenticated('user-alice')
    h.assertNoAuthError()
    expect(h.authChangedSpy).toHaveBeenCalledWith({
      isAuthenticated: true,
      previousIsAuthenticated: false,
      user: expect.objectContaining({ id: 'user-alice' }),
      previousUser: null,
    })
  })

  it('signOut clears auth state and emits a single de-auth transition', async () => {
    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
    })

    await h.triggerSignOut()

    h.assertUnauthenticated()
    h.assertNoAuthError()
    expect(h.invalidateHandlerSpy).toHaveBeenCalledTimes(1)
    expect(h.signOutSpy).toHaveBeenCalledTimes(1)
    expect(h.authChangedSpy).toHaveBeenCalledWith({
      isAuthenticated: false,
      previousIsAuthenticated: true,
      user: null,
      previousUser: expect.objectContaining({ id: 'user-alice' }),
    })
  })
})
