import { beforeEach, describe, expect, it, vi } from 'vitest'

type StorageMap = Map<string, unknown>
const backingStore: StorageMap = new Map()

vi.mock('nitropack/runtime', () => ({
  useStorage: () => ({
    async getItem<T>(key: string): Promise<T | null> {
      return (backingStore.get(key) as T | undefined) ?? null
    },
    async setItem(key: string, value: unknown) {
      backingStore.set(key, value)
    },
  }),
}))

describe('devtools auth proxy registry', () => {
  beforeEach(() => {
    backingStore.clear()
  })

  it('records and aggregates request stats using Nitro storage', async () => {
    const registry = await import('../../src/runtime/devtools/auth-proxy-registry')

    await registry.recordAuthProxyRequest({
      id: '1',
      path: '/convex/token',
      method: 'GET',
      timestamp: Date.now(),
      duration: 40,
      status: 200,
      success: true,
    })
    await registry.recordAuthProxyRequest({
      id: '2',
      path: '/get-session',
      method: 'GET',
      timestamp: Date.now(),
      duration: 80,
      status: 500,
      success: false,
      error: 'boom',
    })

    const stats = await registry.getAuthProxyStats()
    expect(stats.totalRequests).toBe(2)
    expect(stats.successCount).toBe(1)
    expect(stats.errorCount).toBe(1)
    expect(stats.avgDuration).toBe(40)
    expect(stats.recentRequests.map((r) => r.id)).toEqual(['2', '1'])
  })

  it('clears stored stats', async () => {
    const registry = await import('../../src/runtime/devtools/auth-proxy-registry')
    await registry.recordAuthProxyRequest({
      id: '1',
      path: '/convex/token',
      method: 'GET',
      timestamp: Date.now(),
      success: true,
    })
    await registry.clearAuthProxyStats()

    const stats = await registry.getAuthProxyStats()
    expect(stats.totalRequests).toBe(0)
    expect(stats.recentRequests).toEqual([])
  })
})
