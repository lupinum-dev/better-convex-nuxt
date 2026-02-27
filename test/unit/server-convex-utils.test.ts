import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  serverConvexAction,
  serverConvexMutation,
  serverConvexQuery,
} from '../../src/runtime/server/utils/convex'

vi.mock('#imports', () => ({
  useRuntimeConfig: vi.fn(() => ({ public: { convex: {} } })),
}))

describe('server Convex fetch helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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
      'http://127.0.0.1:3210',
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
      'http://127.0.0.1:3210',
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
      serverConvexQuery('http://127.0.0.1:3210', { _path: 'notes:list' } as never, {} as never),
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
        'http://127.0.0.1:3210',
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

    await serverConvexAction('http://127.0.0.1:3210', symbolRef as never, {} as never)
    await serverConvexAction('http://127.0.0.1:3210', { _path: 'path:field' } as never, {} as never)
    await serverConvexAction(
      'http://127.0.0.1:3210',
      { functionPath: 'function:path' } as never,
      {} as never,
    )
    await serverConvexAction('http://127.0.0.1:3210', {} as never, {} as never)

    const paths = fetchMock.mock.calls.map((call) => {
      const init = (call as unknown[])[1] as RequestInit | undefined
      return JSON.parse(String(init?.body)).path
    })
    expect(paths).toEqual(['symbol:path', 'path:field', 'function:path', 'unknown'])
  })
})
