import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  serverConvexAction,
  serverConvexMutation,
  serverConvexQuery,
} from '../../src/runtime/server/utils/convex'

const { useRuntimeConfigMock } = vi.hoisted(() => ({
  useRuntimeConfigMock: vi.fn(() => ({
    public: {
      convex: {
        url: 'http://127.0.0.1:3210',
        siteUrl: 'http://127.0.0.1:3220',
      },
    },
  })),
}))

const { useRequestEventMock } = vi.hoisted(() => ({
  useRequestEventMock: vi.fn(() => undefined),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: useRuntimeConfigMock,
  useRequestEvent: useRequestEventMock,
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
    useRequestEventMock.mockReturnValue(undefined)
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

  it('resolves the current Nitro event when the event argument is omitted', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    useRequestEventMock.mockReturnValue(createEvent() as never)

    const result = await serverConvexQuery({ _path: 'notes:list' } as never, { limit: 2 } as never)

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws a clear error when no request context is available and event is omitted', async () => {
    await expect(
      serverConvexQuery({ _path: 'notes:list' } as never, { limit: 2 } as never),
    ).rejects.toThrow(/No H3 event available/)
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
    ).rejects.toThrow(/Unexpected response type: text\/html/)
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
    const tokenFetchMock = vi.fn(async () => ({ token: 'auto.jwt.token' }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('$fetch', tokenFetchMock)

    await serverConvexQuery(
      createEvent('better-auth.session_token=session123'),
      { _path: 'notes:list' } as never,
      {} as never,
      { auth: 'auto' },
    )

    expect(tokenFetchMock).toHaveBeenCalledTimes(1)
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

  it('includes helper metadata on auth resolution failures', async () => {
    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: {
          url: 'https://api.example.com',
          siteUrl: '',
        },
      },
    })

    try {
      await serverConvexQuery(
        createEvent('better-auth.session_token=session123'),
        { _path: 'tasks:list' } as never,
        {} as never,
        { auth: 'required' },
      )
      throw new Error('Expected query to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(error).toMatchObject({
        helper: 'serverConvexQuery',
        functionPath: 'tasks:list',
        authMode: 'required',
      })
      expect((error as Error).message).toContain('Failed to resolve auth for tasks:list')
      expect((error as Error).message).toContain('convex.siteUrl is not configured')
    }
  })

  it('auth:none never calls token exchange endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    const tokenFetchMock = vi.fn(async () => ({ token: 'should-not-be-used' }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('$fetch', tokenFetchMock)

    await serverConvexQuery(
      createEvent('better-auth.session_token=session123'),
      { _path: 'notes:list' } as never,
      {} as never,
      { auth: 'none' },
    )

    expect(tokenFetchMock).not.toHaveBeenCalled()
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
    })
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})
