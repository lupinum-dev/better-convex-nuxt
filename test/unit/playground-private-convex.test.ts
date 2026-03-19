import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH,
  privateSystemOverview,
} from '../../playground/private-function-references'

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
    vi.useRealTimers()

    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: {
          url: 'https://demo.convex.cloud',
          privateBridgeKey: 'should-not-be-read-from-public-runtime',
        },
      },
    })

    process.env.PLAYGROUND_ENABLE_PRIVATE_BRIDGE_REFERENCE = 'true'
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
    delete process.env.PLAYGROUND_ENABLE_PRIVATE_BRIDGE_REFERENCE
    delete process.env.CONVEX_PRIVATE_BRIDGE_KEY
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reports the privileged reference lane as disabled until explicitly enabled', async () => {
    delete process.env.PLAYGROUND_ENABLE_PRIVATE_BRIDGE_REFERENCE

    const { getPrivateBridgeReferenceState } =
      await import('../../playground/server/utils/private-convex')

    expect(getPrivateBridgeReferenceState()).toMatchObject({
      demoEnabled: false,
      hasServerBridgeKey: true,
      hasConvexUrl: true,
      isConfigured: false,
    })
  })

  it('injects the server-only bridge key into privileged queries', async () => {
    const { privateConvexQuery } = await import('../../playground/server/utils/private-convex')

    const result = await privateConvexQuery(privateSystemOverview)

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://demo.convex.cloud/api/query')
    expect(JSON.parse(String(init.body))).toMatchObject({
      path: PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH,
      args: {
        apiKey: 'server-only-bridge-key',
      },
    })
  })

  it('returns readiness metadata instead of attempting a backend call when the demo lane is disabled', async () => {
    delete process.env.PLAYGROUND_ENABLE_PRIVATE_BRIDGE_REFERENCE

    const handler = (await import('../../playground/server/api/references/private-system.get'))
      .default
    const result = await handler({} as never)

    expect(result).toMatchObject({
      ok: false,
      functionPath: PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH,
      readiness: {
        demoEnabled: false,
        isConfigured: false,
      },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 404 from the privileged route in production mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      const handler = (await import('../../playground/server/api/references/private-system.get'))
        .default
      await expect(handler({} as never)).rejects.toMatchObject({
        statusCode: 404,
      })
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('keeps readiness metadata when the backend call fails after the lane is configured', async () => {
    vi.stubGlobal('fetch', fetchMock.mockRejectedValue(new Error('boom')))

    const handler = (await import('../../playground/server/api/references/private-system.get'))
      .default
    const result = await handler({} as never)

    expect(result).toMatchObject({
      ok: false,
      helper: 'privateConvexQuery',
      source: 'privileged',
      functionPath: PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH,
      readiness: {
        demoEnabled: true,
        isConfigured: true,
      },
    })
    expect(result.message).toContain('boom')
  })

  it('fails closed when the bridge key is missing, even if public runtime contains a lookalike', async () => {
    delete process.env.CONVEX_PRIVATE_BRIDGE_KEY

    const { privateConvexQuery } = await import('../../playground/server/utils/private-convex')

    await expect(privateConvexQuery(privateSystemOverview)).rejects.toThrow('Missing server-only')
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
        functionPath: PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH,
        convexUrl: 'https://demo.convex.cloud',
      })
      expect((error as Error).message).toContain('Privileged query failed')
      expect((error as Error).message).toContain('boom')
    }
  })

  it('does not reflect upstream response bodies in privileged errors', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock.mockResolvedValue(
        new Response('<html>secret upstream body</html>', {
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )

    const { privateConvexQuery } = await import('../../playground/server/utils/private-convex')

    try {
      await privateConvexQuery(privateSystemOverview)
      throw new Error('Expected query to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('Unexpected response type: text/html')
      expect((error as Error).message).not.toContain('secret upstream body')
    }
  })

  it('adds timeout metadata when the privileged request hangs', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal
          signal?.addEventListener(
            'abort',
            () => {
              reject(signal.reason ?? new Error('aborted'))
            },
            { once: true },
          )
        })
      }),
    )

    const { privateConvexQuery } = await import('../../playground/server/utils/private-convex')

    const request = privateConvexQuery(privateSystemOverview).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(5_000)

    const error = await request
    expect(error).toMatchObject({
      helper: 'privateConvexQuery',
      source: 'privileged',
      operation: 'query',
      functionPath: PRIVATE_SYSTEM_OVERVIEW_FUNCTION_PATH,
      convexUrl: 'https://demo.convex.cloud',
    })
    expect((error as Error).message).toContain('Request timed out after 5000ms')
  })
})
