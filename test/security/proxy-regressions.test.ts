import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  requestUrl: vi.fn(),
  responseStatus: vi.fn(),
  responseHeaders: vi.fn(),
  responseCookie: vi.fn(),
}))

vi.mock('h3', () => ({
  appendResponseHeader: mocks.responseCookie,
  createError(input: { statusCode: number; message: string; data?: unknown }) {
    return Object.assign(new Error(input.message), input)
  },
  defineEventHandler: (handler: unknown) => handler,
  getRequestURL: mocks.requestUrl,
  getRequestWebStream(event: { body?: Uint8Array }) {
    if (!event.body) return undefined
    return new ReadableStream({
      start(controller) {
        controller.enqueue(event.body)
        controller.close()
      },
    })
  },
  send: (_event: unknown, body: Uint8Array) => body,
  setHeaders: mocks.responseHeaders,
  setResponseStatus: mocks.responseStatus,
}))

vi.mock('../../src/runtime/utils/runtime-config', () => ({ getConvexRuntimeConfig: mocks.config }))

function event(method = 'GET', body?: Uint8Array, headers: Record<string, string> = {}) {
  return { method, body, headers: new Headers({ origin: 'https://app.example.test', ...headers }) }
}

describe('auth proxy security regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requestUrl.mockReturnValue(new URL('https://app.example.test/api/auth/get-session'))
    mocks.config.mockReturnValue({
      url: 'https://demo.convex.cloud',
      siteUrl: 'https://demo.convex.site',
      auth: {
        proxy: {
          maxRequestBodyBytes: 1_048_576,
          maxResponseBodyBytes: 1_048_576,
          trustedClientIpHeader: '',
        },
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('makes exactly one manual request and never follows an upstream redirect', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('', {
          status: 302,
          headers: { location: 'http://127.0.0.1/api/auth/get-session' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
    await handler(event())
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.convex.site/api/auth/get-session',
      expect.objectContaining({ redirect: 'manual' }),
    )
    expect(mocks.responseStatus).toHaveBeenCalledWith(expect.anything(), 302, '')
    expect(mocks.responseHeaders).toHaveBeenCalledWith(expect.anything(), {
      'cache-control': 'private, no-store',
    })
  })

  it('preserves bytes, regenerates framing, and replaces proxy controls', async () => {
    const bytes = new Uint8Array([255, 0, 97])
    let forwarded: RequestInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        forwarded = init
        return new Response('{}')
      }),
    )
    mocks.requestUrl.mockReturnValue(new URL('https://app.example.test/api/auth/plugin/binary'))
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
    await handler(
      event('POST', bytes, {
        'content-length': '3',
        'content-type': 'application/octet-stream',
        'x-forwarded-for': '10.0.0.1',
        'x-better-auth-forwarded-host': 'evil.test',
      }),
    )
    expect(new Uint8Array(forwarded?.body as ArrayBuffer)).toEqual(bytes)
    const headers = forwarded?.headers as Record<string, string>
    expect(headers['content-length']).toBeUndefined()
    expect(headers['x-forwarded-for']).toBeUndefined()
    expect(headers['x-better-auth-forwarded-host']).toBe('app.example.test')
    expect(headers['x-better-auth-forwarded-proto']).toBe('https')
  })

  it('rejects cross-origin and non-GET/POST requests before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
    await expect(handler(event('OPTIONS'))).rejects.toMatchObject({ statusCode: 405 })
    await expect(
      handler(event('GET', undefined, { origin: 'https://evil.example' })),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the deadline active while the upstream body is stalled', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              new ReadableStream({
                start() {
                  // Headers resolve, but the body intentionally never completes.
                },
              }),
            ),
        ),
      )
      const handler = (await import('../../src/runtime/server/api/auth/[...]'))
        .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
      const response = expect(handler(event())).rejects.toMatchObject({ statusCode: 502 })
      await vi.advanceTimersByTimeAsync(8_001)
      await response
    } finally {
      vi.useRealTimers()
    }
  })
})
