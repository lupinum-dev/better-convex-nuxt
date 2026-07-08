import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  serverConvexAction,
  serverConvexMutation,
  serverConvexQuery,
} from '../../src/runtime/server/utils/convex'

const { useRuntimeConfigMock, fetchWithTimeoutMock } = vi.hoisted(() => ({
  useRuntimeConfigMock: vi.fn(() => ({
    public: {
      convex: {
        url: 'http://127.0.0.1:3210',
        siteUrl: 'http://127.0.0.1:3220',
      },
    },
  })),
  fetchWithTimeoutMock: vi.fn(),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: useRuntimeConfigMock,
}))

// The single cookie -> JWT exchange (F-13) goes through
// server/utils/token-exchange -> fetchWithTimeout. Mock the http layer so the
// exchange is observable independently of the operation's global fetch.
vi.mock('../../src/runtime/server/utils/http', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}))

function createEvent(cookie?: string): H3Event {
  return {
    node: {
      req: {
        headers: {
          ...(cookie ? { cookie } : {}),
        },
      },
    },
  } as unknown as H3Event
}

describe('server Convex fetch helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchWithTimeoutMock.mockReset()
    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: {
          url: 'http://127.0.0.1:3210',
          siteUrl: 'http://127.0.0.1:3220',
        },
      },
    })
  })

  it('sends query request with expected shape', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await serverConvexQuery(
      createEvent(),
      { _path: 'notes:list' } as never,
      { limit: 5 } as never,
    )

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [url, init] = firstCall as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:3210/api/query')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init.body))).toEqual({
      path: 'notes:list',
      args: { limit: 5 },
    })
  })

  it('adds Authorization header when authToken is provided', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: 'm-ok' }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexMutation(
      createEvent(),
      { _path: 'notes:add' } as never,
      { title: 'Hello' } as never,
      { authToken: 'jwt-token' },
    )

    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer jwt-token',
    })
  })

  it('throws a helpful error for non-JSON responses', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('bad gateway html', {
          headers: { 'content-type': 'text/html' },
          status: 502,
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      serverConvexQuery(createEvent(), { _path: 'notes:list' } as never, {} as never),
    ).rejects.toThrow('Unexpected response type: text/html')
  })

  it('parses Convex error response payloads', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'error',
            errorMessage: 'Forbidden: notes.delete',
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 403,
          },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      serverConvexMutation(
        createEvent(),
        { _path: 'notes:delete' } as never,
        { id: 'n1' } as never,
      ),
    ).rejects.toThrow('Forbidden: notes.delete')
  })

  it('extracts function path from symbol, _path, functionPath, and fallback', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: true }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const symbolRef = {
      [Symbol.for('functionName')]: 'symbol:path',
    }

    const event = createEvent()
    await serverConvexAction(event, symbolRef as never, {} as never)
    await serverConvexAction(event, { _path: 'path:field' } as never, {} as never)
    await serverConvexAction(event, { functionPath: 'function:path' } as never, {} as never)
    await serverConvexAction(event, {} as never, {} as never)

    const paths = fetchMock.mock.calls.map((call) => {
      const init = (call as unknown[])[1] as RequestInit | undefined
      return JSON.parse(String(init?.body)).path
    })
    expect(paths).toEqual(['symbol:path', 'path:field', 'function:path', 'unknown'])
  })

  it('auth:auto exchanges cookie for token and attaches bearer header', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    fetchWithTimeoutMock.mockResolvedValue(
      new Response(JSON.stringify({ token: 'auto.jwt.token' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(
      createEvent(
        'private_app_cookie=secret; better-auth.session_token=session123; __Secure-better-auth.callback=state',
      ),
      { _path: 'notes:list' } as never,
      {} as never,
      { auth: 'auto' },
    )

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3220/api/auth/convex/token',
      expect.objectContaining({
        headers: {
          Cookie: 'better-auth.session_token=session123; __Secure-better-auth.callback=state',
        },
      }),
    )
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer auto.jwt.token',
    })
  })

  it('auth:required throws when session cookie is missing', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      serverConvexQuery(createEvent(), { _path: 'notes:list' } as never, {} as never, {
        auth: 'required',
      }),
    ).rejects.toThrow('Authentication required')
  })

  it('auth:none never calls token exchange endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(
      createEvent('better-auth.session_token=session123'),
      { _path: 'notes:list' } as never,
      {} as never,
      { auth: 'none' },
    )

    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
    })
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('uses configured default auth:none when no per-call auth option is passed', async () => {
    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: {
          url: 'http://127.0.0.1:3210',
          siteUrl: 'http://127.0.0.1:3220',
          defaults: { auth: 'none' },
        },
      },
    } as never)
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(
      createEvent('better-auth.session_token=session123'),
      { _path: 'notes:list' } as never,
      {} as never,
    )

    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})
