import { afterEach, describe, expect, it } from 'vitest'

import {
  createAuthHarness,
  createMockTokenExchange,
  mintJwtExpiringIn,
  TEST_USERS,
} from '../harness'
import { getJwtTimeUntilExpiryMs } from '../../src/runtime/utils/convex-shared'
import { TOKEN_EXPIRY_SAFETY_BUFFER_MS } from '../../src/runtime/utils/constants'

let h: Awaited<ReturnType<typeof createAuthHarness>>

afterEach(() => h?.dispose())

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

    h.assertAuthenticated('user-bob')
    expect(exchange.callCount).toBe(1)
  })

  it('invalidate clears token, user, and auth error', async () => {
    h = await createAuthHarness({
      initialToken: TEST_USERS.alice.token,
      initialUser: TEST_USERS.alice.user,
      initialAuthError: 'stale error',
    })

    await h.triggerInvalidate()

    h.assertUnauthenticated()
    h.assertNoAuthError()
  })

  it('fails closed when refresh completes without a token', async () => {
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

  it('fails closed when refresh returns an invalid JWT that cannot be decoded', async () => {
    const exchange = createMockTokenExchange()
    exchange.respondWithToken('not-a-valid.jwt')

    h = await createAuthHarness({ tokenExchange: exchange })

    await expect(h.triggerRefresh()).rejects.toThrow(/decode authenticated user/i)
    h.assertUnauthenticated()
    h.assertAuthError(/decode authenticated user/i)
  })
})
