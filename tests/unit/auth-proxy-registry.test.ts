import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('auth proxy registry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('nitropack/runtime')
  })

  it('fails closed when Nitro storage is unavailable', async () => {
    vi.doMock('nitropack/runtime', () => ({
      useStorage: undefined,
    }))

    const { clearAuthProxyStats, getAuthProxyStats, recordAuthProxyRequest } =
      await import('../../src/runtime/devtools/auth-proxy-registry')

    await expect(
      recordAuthProxyRequest({
        id: 'req_1',
        path: '/api/auth/get-session',
        method: 'GET',
        timestamp: Date.now(),
        success: true,
        duration: 12,
        status: 200,
      }),
    ).resolves.toBeUndefined()

    await expect(clearAuthProxyStats()).resolves.toBeUndefined()
    await expect(getAuthProxyStats()).resolves.toEqual({
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      avgDuration: 0,
      recentRequests: [],
    })
  })
})
