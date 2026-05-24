import { afterEach, describe, expect, it } from 'vitest'

import { createAuthHarness, createMockTokenExchange, TEST_USERS } from '../support/auth'

let h: Awaited<ReturnType<typeof createAuthHarness>>

afterEach(() => h?.dispose())

describe('OWASP A01: Broken Access Control (Runtime)', () => {
  it('never treats a token-only state as authenticated', async () => {
    h = await createAuthHarness({
      initialToken: 'invalid.jwt.token',
      initialUser: null,
      initialAuthError: 'Failed to decode auth token',
    })

    expect(h.isAuthenticated.value).toBe(false)
  })

  it('does not allow direct token mutation to bypass user-based auth checks', async () => {
    h = await createAuthHarness()

    h.token.value = 'manually-injected.token'
    await h.flush()

    expect(h.isAuthenticated.value).toBe(false)
    expect(h.isAnonymous.value).toBe(true)
  })
})

describe('OWASP A04: Insecure Design (Runtime)', () => {
  it('dedupes concurrent refreshAuth calls', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithPayload(TEST_USERS.alice.payload)

    h = await createAuthHarness({ tokenExchange: exchange })

    const [first, second] = await Promise.allSettled([h.triggerRefresh(), h.triggerRefresh()])

    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('fulfilled')
    expect(exchange.callCount).toBe(1)
    expect(h.isAuthenticated.value).toBe(true)
    expect(h.pending.value).toBe(false)
    expect(h.user.value?.email).toBe('alice@test.com')
  })

  it('dedupes concurrent signOut calls', async () => {
    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      signOutBehavior: 'slow',
    })

    const [first, second] = await Promise.allSettled([h.triggerSignOut(), h.triggerSignOut()])

    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('fulfilled')
    expect(h.signOutSpy).toHaveBeenCalledTimes(1)
    expect(h.isAuthenticated.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.user.value).toBeNull()
  })

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

    expect(h.isAuthenticated.value).toBe(false)
    expect(h.pending.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.user.value).toBeNull()
    expect(h.rawAuthError.value).toBeNull()
  })

  it('anonymous refresh clears previously authenticated state instead of leaving it stale', async () => {
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

    expect(h.isAuthenticated.value).toBe(false)
    expect(h.pending.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.user.value).toBeNull()
    expect(h.rawAuthError.value).toBeNull()
  })
})

describe('OWASP A07: Authentication Failures (Runtime)', () => {
  it('replaces the full token on refresh instead of merging with the old one', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithPayload(TEST_USERS.bob.payload)

    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      tokenExchange: exchange,
    })

    const previousToken = h.token.value
    await h.triggerRefresh()

    expect(h.token.value).not.toBe(previousToken)
    expect(h.token.value).not.toContain(previousToken ?? '')
    expect(h.isAuthenticated.value).toBe(true)
    expect(h.pending.value).toBe(false)
    expect(h.user.value?.email).toBe('bob@test.com')
  })

  it('does not restore the previous identity after signOut when the exchange misses', async () => {
    const exchange = createMockTokenExchange()

    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      tokenExchange: exchange,
    })

    await h.triggerSignOut()
    exchange.respondWithMiss()

    await expect(h.triggerRefresh()).resolves.toBeUndefined()
    expect(h.isAuthenticated.value).toBe(false)
    expect(h.isAnonymous.value).toBe(true)
    expect(h.pending.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.user.value).toBeNull()
  })
})
