import { afterEach, describe, expect, it } from 'vitest'

import {
  createAuthHarness,
  createMockTokenExchange,
  TEST_USERS,
} from '../../harness'

let h: Awaited<ReturnType<typeof createAuthHarness>>

afterEach(() => h?.dispose())

describe('OWASP A04: Insecure Design (Runtime)', () => {
  it('signOut wins over a pending refresh to avoid restoring stale auth state', async () => {
    const exchange = createMockTokenExchange()
    exchange.enqueue({
      data: { token: TEST_USERS.alice.token },
      error: null,
      delayMs: 25,
    })

    h = await createAuthHarness({
      initialToken: TEST_USERS.bob.token,
      initialUser: TEST_USERS.bob.user,
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

  it('refresh failure clears previously authenticated state instead of leaving it stale', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithMiss()

    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      tokenExchange: exchange,
    })

    await expect(h.triggerRefresh()).rejects.toThrow(/without a token/)
    h.assertUnauthenticated()
    h.assertAuthError(/without a token/)
  })

  it('invalidate during a pending refresh leaves the final state unauthenticated', async () => {
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
