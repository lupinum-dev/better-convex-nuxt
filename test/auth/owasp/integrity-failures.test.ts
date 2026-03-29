/**
 * OWASP A08: Software and Data Integrity Failures
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const backingStore = new Map<string, unknown>()

vi.mock('nitropack/runtime', () => ({
  useStorage: () => ({
    async getItem<T>(key: string): Promise<T | null> {
      return (backingStore.get(key) as T) ?? null
    },
    async setItem(key: string, value: unknown, _opts?: { ttl: number }) {
      backingStore.set(key, value)
    },
    async removeItem(key: string) {
      backingStore.delete(key)
    },
  }),
}))

describe('OWASP A08: Integrity Failures', () => {
  beforeEach(() => {
    backingStore.clear()
  })

  it('hashes cache keys instead of storing raw session tokens', async () => {
    const { setCachedAuthToken } = await import('../../../src/runtime/server/utils/auth-cache')

    await setCachedAuthToken('session-secret-token', 'jwt-value', 60)

    expect(Array.from(backingStore.keys()).some(key => key.includes('session-secret-token')))
      .toBe(false)
  })

  it('clearing one cached session does not affect another', async () => {
    const {
      setCachedAuthToken,
      getCachedAuthToken,
      serverConvexClearAuthCache,
    } = await import('../../../src/runtime/server/utils/auth-cache')

    await setCachedAuthToken('session-a', 'jwt-a', 60)
    await setCachedAuthToken('session-b', 'jwt-b', 60)

    await serverConvexClearAuthCache('session-a')

    expect(await getCachedAuthToken('session-a')).toBeNull()
    expect(await getCachedAuthToken('session-b')).toBe('jwt-b')
  })

  it('reads back the cached JWT for the same session token', async () => {
    const { setCachedAuthToken, getCachedAuthToken } =
      await import('../../../src/runtime/server/utils/auth-cache')

    await setCachedAuthToken('session-abc', 'jwt-for-abc', 60)
    expect(await getCachedAuthToken('session-abc')).toBe('jwt-for-abc')
  })
})
