import { EventEmitter } from 'node:events'

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
  getRequestWebStream(event: { body?: Uint8Array | ReadableStream<Uint8Array> }) {
    if (!event.body) return undefined
    if (event.body instanceof ReadableStream) return event.body
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

function event(
  method = 'GET',
  body?: Uint8Array | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
) {
  return {
    method,
    body,
    headers: new Headers({ origin: 'https://app.example.test', ...headers }),
    node: {
      req: Object.assign(new EventEmitter(), {
        complete: true,
        pause: vi.fn(),
        resume: vi.fn(),
        socket: undefined,
      }),
      res: Object.assign(new EventEmitter(), {
        destroy: vi.fn(),
        end: vi.fn(),
        headersSent: false,
        shouldKeepAlive: true,
        socket: undefined,
        writableFinished: false,
      }),
    },
  }
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

  it('preserves bytes, regenerates framing, and drops proxy controls', async () => {
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
    expect(headers['x-better-auth-forwarded-host']).toBeUndefined()
    expect(headers['x-better-auth-forwarded-proto']).toBeUndefined()
  })

  it('forwards independent cookies, removes unsafe response framing, and forces no-store', async () => {
    const responseHeaders = new Headers({
      'cdn-cache-control': 'public, s-maxage=86400',
      'content-length': '999',
      'content-encoding': 'gzip',
      'content-type': 'application/json',
      connection: 'keep-alive, x-hop',
      'surrogate-control': 'max-age=86400',
      'vercel-cdn-cache-control': 'public, s-maxage=86400',
      'x-hop': 'must-not-forward',
    })
    responseHeaders.append('set-cookie', 'better-auth.session_token=one; Path=/; HttpOnly')
    responseHeaders.append('set-cookie', 'better-auth.callback=two; Path=/; HttpOnly')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { headers: responseHeaders })),
    )
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
    await handler(event())
    expect(mocks.responseCookie).toHaveBeenCalledTimes(2)
    expect(mocks.responseCookie).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'set-cookie',
      'better-auth.session_token=one; Path=/; HttpOnly',
    )
    expect(mocks.responseCookie).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'set-cookie',
      'better-auth.callback=two; Path=/; HttpOnly',
    )
    expect(mocks.responseHeaders).not.toHaveBeenCalledWith(expect.anything(), {
      'content-length': expect.anything(),
    })
    expect(mocks.responseHeaders).not.toHaveBeenCalledWith(expect.anything(), {
      'content-encoding': expect.anything(),
    })
    for (const header of [
      'cdn-cache-control',
      'surrogate-control',
      'vercel-cdn-cache-control',
      'x-hop',
    ]) {
      expect(mocks.responseHeaders).not.toHaveBeenCalledWith(expect.anything(), {
        [header]: expect.anything(),
      })
    }
    expect(mocks.responseHeaders).toHaveBeenCalledWith(expect.anything(), {
      'cache-control': 'private, no-store',
    })
  })

  it('rejects Domain-scoped Better Auth cookies and cancels the upstream body', async () => {
    const cancel = vi.fn()
    const responseHeaders = new Headers()
    responseHeaders.append(
      'set-cookie',
      'better-auth.session_token=one; Domain=.example.test; Path=/; Secure; HttpOnly',
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new ReadableStream({ start() {}, cancel }), { headers: responseHeaders }),
      ),
    )
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>

    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 502,
      data: { code: 'BCN_AUTH_PROXY_COOKIE_DOMAIN_UNSUPPORTED' },
    })
    expect(cancel).toHaveBeenCalledOnce()
    expect(mocks.responseCookie).not.toHaveBeenCalled()
  })

  it('rejects unsupported upstream cookie names and cancels the upstream body', async () => {
    const cancel = vi.fn()
    const responseHeaders = new Headers()
    responseHeaders.append('set-cookie', 'custom.session_token=one; Path=/; Secure; HttpOnly')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new ReadableStream({ start() {}, cancel }), { headers: responseHeaders }),
      ),
    )
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>

    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 502,
      data: { code: 'BCN_AUTH_PROXY_COOKIE_NAME_UNSUPPORTED' },
    })
    expect(cancel).toHaveBeenCalledOnce()
    expect(mocks.responseCookie).not.toHaveBeenCalled()
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
    const hostileReferer = event('POST')
    hostileReferer.headers.delete('origin')
    hostileReferer.headers.set('referer', 'https://evil.example/form')
    await expect(handler(hostileReferer)).rejects.toMatchObject({ statusCode: 403 })
    expect(hostileReferer.node.res.shouldKeepAlive).toBe(false)
    expect(mocks.responseHeaders).toHaveBeenCalledWith(hostileReferer, {
      connection: 'close',
    })
    await expect(
      handler(
        event('POST', undefined, {
          origin: 'https://app.example.test',
          'sec-fetch-site': 'same-site',
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.responseHeaders).toHaveBeenCalledWith(expect.anything(), {
      'cache-control': 'private, no-store',
    })
  })

  it('rejects framed GET and encoded POST bodies before fetch and closes the connection', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>

    const framedGet = event('GET', undefined, { 'content-length': '1' })
    framedGet.node.req.complete = false
    await expect(handler(framedGet)).rejects.toMatchObject({
      statusCode: 400,
      data: { code: 'BCN_AUTH_PROXY_GET_BODY_REJECTED' },
    })
    expect(framedGet.node.res.shouldKeepAlive).toBe(false)

    mocks.requestUrl.mockReturnValue(new URL('https://app.example.test/api/auth/plugin/action'))
    const encodedPost = event('POST', new Uint8Array([1]), { 'content-encoding': 'gzip' })
    await expect(handler(encodedPost)).rejects.toMatchObject({
      statusCode: 415,
      data: { code: 'BCN_AUTH_PROXY_REQUEST_ENCODING_UNSUPPORTED' },
    })
    expect(encodedPost.node.res.shouldKeepAlive).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.responseHeaders).toHaveBeenCalledWith(framedGet, {
      'cache-control': 'private, no-store',
    })
    expect(mocks.responseHeaders).toHaveBeenCalledWith(encodedPost, {
      'cache-control': 'private, no-store',
    })
  })

  it('cancels an upstream response with an unsupported content encoding', async () => {
    const cancel = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              pull() {
                // The unsupported encoding is rejected before reading.
              },
              cancel,
            }),
            { headers: { 'content-encoding': 'zstd' } },
          ),
      ),
    )
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>

    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 502,
      data: { code: 'BCN_AUTH_PROXY_UPSTREAM_ENCODING_UNSUPPORTED' },
    })
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    expect(mocks.responseHeaders).toHaveBeenCalledWith(expect.anything(), {
      'cache-control': 'private, no-store',
    })
  })

  it('preserves missing-origin GET callback semantics', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 302 }))
    vi.stubGlobal('fetch', fetchMock)
    mocks.requestUrl.mockReturnValue(
      new URL('https://app.example.test/api/auth/callback/github?code=opaque&state=opaque'),
    )
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
    const callback = event('GET')
    callback.headers.delete('origin')
    callback.headers.set('referer', 'https://github.com/')
    callback.headers.set('sec-fetch-site', 'cross-site')

    await handler(callback)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.convex.site/api/auth/callback/github?code=opaque&state=opaque',
      expect.anything(),
    )
  })

  it('forwards only the exact core Apple-style form_post callback shape', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 302 }))
    vi.stubGlobal('fetch', fetchMock)
    mocks.requestUrl.mockReturnValue(new URL('https://app.example.test/api/auth/callback/apple'))
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
    const body = new TextEncoder().encode('code=opaque&state=opaque')
    const callbackHeaders = {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://appleid.apple.com',
      referer: 'https://appleid.apple.com/',
      'sec-fetch-site': 'cross-site',
    }

    await handler(event('POST', body, callbackHeaders))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.convex.site/api/auth/callback/apple',
      expect.objectContaining({
        body: expect.any(ArrayBuffer),
        redirect: 'manual',
      }),
    )

    fetchMock.mockClear()
    mocks.requestUrl.mockReturnValue(
      new URL('https://app.example.test/api/auth/callback/apple/extra'),
    )
    await expect(handler(event('POST', body, callbackHeaders))).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the deadline active while the upstream body is stalled', async () => {
    vi.useFakeTimers()
    try {
      const cancel = vi.fn()
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              new ReadableStream({
                start() {
                  // Headers resolve, but the body intentionally never completes.
                },
                cancel,
              }),
            ),
        ),
      )
      const handler = (await import('../../src/runtime/server/api/auth/[...]'))
        .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
      const response = expect(handler(event())).rejects.toMatchObject({ statusCode: 502 })
      await vi.advanceTimersByTimeAsync(8_001)
      await response
      expect(cancel).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not let continuous response chunks extend the wall-clock deadline', async () => {
    vi.useFakeTimers()
    try {
      let timer: ReturnType<typeof setTimeout> | undefined
      const cancel = vi.fn(() => {
        if (timer) clearTimeout(timer)
      })
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  const emit = () => {
                    controller.enqueue(new Uint8Array([1]))
                    timer = setTimeout(emit, 1_000)
                  }
                  emit()
                },
                cancel,
              }),
            ),
        ),
      )
      const handler = (await import('../../src/runtime/server/api/auth/[...]'))
        .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
      const response = expect(handler(event())).rejects.toMatchObject({ statusCode: 502 })

      await vi.advanceTimersByTimeAsync(8_001)

      await response
      expect(cancel).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels unread critical-error and declared-oversize upstream bodies', async () => {
    const criticalCancel = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new ReadableStream({ start() {}, cancel: criticalCancel }), {
            status: 500,
          }),
      ),
    )
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>

    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 502,
      data: { code: 'BCN_AUTH_PROXY_UPSTREAM_STATUS' },
    })
    expect(criticalCancel).toHaveBeenCalledOnce()

    const oversizeCancel = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new ReadableStream({ start() {}, cancel: oversizeCancel }), {
            headers: { 'content-length': '1048577' },
          }),
      ),
    )
    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 502,
      data: { code: 'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE' },
    })
    expect(oversizeCancel).toHaveBeenCalledOnce()
  })

  it('propagates browser disconnects during upload and fetch with deterministic cleanup', async () => {
    const uploadCancel = vi.fn()
    const upload = event(
      'POST',
      new ReadableStream({
        pull() {
          // Keep the upload pending until the browser disconnects.
        },
        cancel: uploadCancel,
      }),
    )
    upload.node.req.complete = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
    const uploadResult = expect(handler(upload)).rejects.toMatchObject({ statusCode: 502 })

    await Promise.resolve()
    upload.node.req.emit('aborted')
    await uploadResult
    expect(uploadCancel).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(upload.node.res.shouldKeepAlive).toBe(false)
    expect(upload.node.req.listenerCount('aborted')).toBe(0)
    expect(upload.node.res.listenerCount('close')).toBe(0)

    let upstreamSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_target: string, init?: RequestInit) =>
          await new Promise<Response>((_resolve, reject) => {
            upstreamSignal = init?.signal ?? undefined
            upstreamSignal?.addEventListener('abort', () => reject(upstreamSignal?.reason), {
              once: true,
            })
          }),
      ),
    )
    const duringFetch = event()
    const fetchResult = expect(handler(duringFetch)).rejects.toMatchObject({ statusCode: 502 })
    await vi.waitFor(() => expect(upstreamSignal).toBeDefined())
    duringFetch.node.res.emit('close')

    await fetchResult
    expect(upstreamSignal?.aborted).toBe(true)
    expect(duringFetch.node.req.listenerCount('aborted')).toBe(0)
    expect(duringFetch.node.res.listenerCount('close')).toBe(0)
  })

  it('keeps the deadline and disconnect signal active until the Node response finishes', async () => {
    let upstreamSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_target: string, init?: RequestInit) => {
        upstreamSignal = init?.signal ?? undefined
        return new Response('bounded')
      }),
    )
    const download = event()
    download.node.res.socket = {} as never
    download.node.res.end = vi.fn()
    download.node.res.destroy = vi.fn()
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
    const result = expect(handler(download)).rejects.toMatchObject({ statusCode: 502 })

    await vi.waitFor(() => expect(download.node.res.end).toHaveBeenCalledOnce())
    expect(upstreamSignal?.aborted).toBe(false)
    download.node.res.emit('close')

    await result
    expect(upstreamSignal?.aborted).toBe(true)
    expect(download.node.res.destroy).toHaveBeenCalledOnce()
    expect(download.node.req.listenerCount('aborted')).toBe(0)
    expect(download.node.res.listenerCount('close')).toBe(0)
  })

  it('redacts upstream failure details in production responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('secret-upstream-host.internal:8443')
      }),
    )
    const handler = (await import('../../src/runtime/server/api/auth/[...]'))
      .default as unknown as (input: ReturnType<typeof event>) => Promise<Uint8Array>
    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 502,
      message: 'Failed to proxy request to Convex auth server',
    })
    await expect(handler(event())).rejects.not.toThrow(/secret-upstream-host/)
  })
})
