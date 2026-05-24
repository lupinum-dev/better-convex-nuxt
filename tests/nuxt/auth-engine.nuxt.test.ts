import { afterEach, describe, expect, it } from 'vitest'

import { createAuthHarness } from '../support/auth/auth-harness'
import { mintJwt } from '../support/auth/jwt-factory'
import { createDeferred } from '../support/unit/deferred'

describe('auth engine', () => {
  const disposables: Array<() => void> = []

  afterEach(() => {
    while (disposables.length > 0) {
      disposables.pop()?.()
    }
  })

  it('deduplicates concurrent refresh requests through one in-flight transport call', async () => {
    const harness = await createAuthHarness()
    disposables.push(() => harness.dispose())

    harness.tokenExchange.enqueue({
      data: { token: mintJwt({ sub: 'u-refresh', email: 'refresh@test.com' }) },
      error: null,
      delayMs: 20,
    })

    await Promise.all([harness.triggerRefresh(), harness.triggerRefresh()])

    expect(harness.tokenExchange.callCount).toBe(1)
    expect(harness.isAuthenticated.value).toBe(true)
    expect(harness.user.value?.email).toBe('refresh@test.com')
  })

  it('discards a stale refresh result after invalidate wins the operation race', async () => {
    const harness = await createAuthHarness()
    disposables.push(() => harness.dispose())

    harness.tokenExchange.enqueue({
      data: { token: mintJwt({ sub: 'u-stale', email: 'stale@test.com' }) },
      error: null,
      delayMs: 30,
    })

    const refreshPromise = harness.engine.refreshAuth()
    await harness.engine.invalidateAuth({ clearWasAuthenticated: true })
    await harness.flush()
    await refreshPromise
    await harness.flush()

    expect(harness.tokenExchange.callCount).toBe(1)
    expect(harness.token.value).toBeNull()
    expect(harness.user.value).toBeNull()
    expect(harness.isAuthenticated.value).toBe(false)
    expect(harness.isSessionExpired.value).toBe(false)
  })

  it('serializes signOut so upstream logout runs only once', async () => {
    const harness = await createAuthHarness({
      initialToken: mintJwt({ sub: 'u-signout', email: 'signout@test.com' }),
      initialUser: { displayName: 'Sign Out', email: 'signout@test.com' },
      signOutBehavior: 'slow',
    })
    disposables.push(() => harness.dispose())

    await Promise.all([harness.triggerSignOut(), harness.triggerSignOut()])

    expect(harness.signOutSpy).toHaveBeenCalledTimes(1)
    expect(harness.token.value).toBeNull()
    expect(harness.user.value).toBeNull()
    expect(harness.isAnonymous.value).toBe(true)
    expect(harness.isSessionExpired.value).toBe(false)
  })

  it('keeps pending true while signOut owns the current auth operation', async () => {
    const signOutDeferred = createDeferred<undefined>()
    const harness = await createAuthHarness({
      initialToken: mintJwt({ sub: 'u-pending', email: 'pending@test.com' }),
      initialUser: { displayName: 'Pending User', email: 'pending@test.com' },
      signOutBehavior: () => signOutDeferred.promise,
    })
    disposables.push(() => harness.dispose())

    harness.tokenExchange.enqueue({
      data: { token: mintJwt({ sub: 'u-stale', email: 'stale@test.com' }) },
      error: null,
      delayMs: 20,
    })

    const refreshPromise = harness.engine.refreshAuth()
    await Promise.resolve()

    const signOutPromise = harness.engine.signOut()
    await harness.flush()
    expect(harness.pending.value).toBe(true)

    await refreshPromise
    await harness.flush()
    expect(harness.pending.value).toBe(true)

    signOutDeferred.resolve(undefined)
    await signOutPromise
    await harness.flush()

    expect(harness.pending.value).toBe(false)
    expect(harness.token.value).toBeNull()
    expect(harness.user.value).toBeNull()
  })
})
