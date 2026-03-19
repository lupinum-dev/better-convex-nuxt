import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FunctionReference } from 'convex/server'

import { api } from '../../playground/convex/_generated/api'

const privateSystemOverview = (
  api as unknown as Record<string, { systemOverview: FunctionReference<'query'> }>
)['private/demo']!.systemOverview

const { useRuntimeConfigMock, fetchMock } = vi.hoisted(() => ({
  useRuntimeConfigMock: vi.fn(),
  fetchMock: vi.fn(),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: useRuntimeConfigMock,
}))

describe('playground private Convex helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: {
          url: 'https://demo.convex.cloud',
          privateBridgeKey: 'should-not-be-read-from-public-runtime',
        },
      },
    })

    process.env.CONVEX_PRIVATE_BRIDGE_KEY = 'server-only-bridge-key'
    vi.stubGlobal(
      'fetch',
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  afterEach(() => {
    delete process.env.CONVEX_PRIVATE_BRIDGE_KEY
    vi.unstubAllGlobals()
  })

  it('injects the server-only bridge key into privileged queries', async () => {
    const { privateConvexQuery } = await import('../../playground/server/utils/private-convex')

    const result = await privateConvexQuery(privateSystemOverview)

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://demo.convex.cloud/api/query')
    expect(JSON.parse(String(init.body))).toMatchObject({
      path: 'private/demo:systemOverview',
      args: {
        apiKey: 'server-only-bridge-key',
      },
    })
  })

  it('fails closed when the bridge key is missing, even if public runtime contains a lookalike', async () => {
    delete process.env.CONVEX_PRIVATE_BRIDGE_KEY

    const { privateConvexQuery } = await import('../../playground/server/utils/private-convex')

    await expect(privateConvexQuery(privateSystemOverview)).rejects.toThrow(
      'Missing server-only',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adds privileged error metadata when the backend call fails', async () => {
    vi.stubGlobal('fetch', fetchMock.mockRejectedValue(new Error('boom')))

    const { privateConvexQuery } = await import('../../playground/server/utils/private-convex')

    try {
      await privateConvexQuery(privateSystemOverview)
      throw new Error('Expected query to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(error).toMatchObject({
        helper: 'privateConvexQuery',
        source: 'privileged',
        operation: 'query',
        functionPath: 'private/demo:systemOverview',
        convexUrl: 'https://demo.convex.cloud',
      })
      expect((error as Error).message).toContain('Privileged query failed')
      expect((error as Error).message).toContain('boom')
    }
  })
})
