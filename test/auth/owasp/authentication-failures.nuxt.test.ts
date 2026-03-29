import { afterEach, describe, expect, it } from 'vitest'

import {
  createAuthHarness,
  createMockTokenExchange,
  TEST_USERS,
} from '../../harness'

let h: Awaited<ReturnType<typeof createAuthHarness>>

afterEach(() => h?.dispose())

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
    expect(h.user.value?.id).toBe('user-bob')
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

    await expect(h.triggerRefresh()).rejects.toThrow(/without a token/)
    expect(h.isAuthenticated.value).toBe(false)
    expect(h.pending.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.user.value).toBeNull()
  })
})
