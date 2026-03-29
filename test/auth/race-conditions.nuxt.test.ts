import { afterEach, describe, expect, it } from 'vitest'

import {
  createAuthHarness,
  createMockTokenExchange,
  TEST_USERS,
} from '../harness'

let h: Awaited<ReturnType<typeof createAuthHarness>>

afterEach(() => h?.dispose())

describe('Auth Race Conditions', () => {
  it('dedupes concurrent refreshAuth calls', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithPayload(TEST_USERS.alice.payload)

    h = await createAuthHarness({ tokenExchange: exchange })

    const [first, second] = await Promise.allSettled([
      h.triggerRefresh(),
      h.triggerRefresh(),
    ])

    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('fulfilled')
    expect(exchange.callCount).toBe(1)
    h.assertAuthenticated('user-alice')
  })

  it('dedupes concurrent signOut calls', async () => {
    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      signOutBehavior: 'slow',
    })

    const [first, second] = await Promise.allSettled([
      h.triggerSignOut(),
      h.triggerSignOut(),
    ])

    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('fulfilled')
    expect(h.signOutSpy).toHaveBeenCalledTimes(1)
    h.assertUnauthenticated()
  })

  it('keeps the client signed out when signOut races a late refresh completion', async () => {
    const exchange = createMockTokenExchange()
    exchange.enqueue({
      data: { token: TEST_USERS.alice.token },
      error: null,
      delayMs: 25,
    })

    h = await createAuthHarness({
      tokenExchange: exchange,
      signOutBehavior: 'slow',
    })

    const refreshPromise = h.triggerRefresh()
    const signOutPromise = h.triggerSignOut()

    await Promise.allSettled([refreshPromise, signOutPromise])
    await h.flush()

    h.assertUnauthenticated()
    h.assertNoAuthError()
  })

  it('keeps the client invalidated when invalidate races a late refresh completion', async () => {
    const exchange = createMockTokenExchange()
    exchange.enqueue({
      data: { token: TEST_USERS.alice.token },
      error: null,
      delayMs: 25,
    })

    h = await createAuthHarness({ tokenExchange: exchange })

    const refreshPromise = h.triggerRefresh()
    const invalidatePromise = h.triggerInvalidate()

    await Promise.allSettled([refreshPromise, invalidatePromise])
    await h.flush()

    h.assertUnauthenticated()
    h.assertNoAuthError()
  })
})
