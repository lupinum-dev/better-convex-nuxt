import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearServerJwksCache } from '../../src/runtime/auth/server/verified-jwt'
import {
  serverConvexAction,
  serverConvexMutation,
  serverConvexQuery,
} from '../../src/runtime/convex/server/convex'
import { verifyIdentityForwardingEnvelope } from '../../src/runtime/identity-forwarding'
import { createObservationCapture } from '../../src/runtime/testing'
import { createServerJwksResponse, mintServerJwt } from '../support/auth/server-jwt'

const originalNodeEnv = process.env.NODE_ENV

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

const { useEventMock } = vi.hoisted(() => ({
  useEventMock: vi.fn(() => {
    throw new Error('Nitro request context is not available')
  }),
}))

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: useRuntimeConfigMock,
  useEvent: useEventMock,
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: useRuntimeConfigMock,
}))

function createEvent(cookie?: string): H3Event {
  return {
    __is_event__: true,
    node: {
      req: {
        headers: {
          ...(cookie ? { cookie } : {}),
        },
      },
      res: {},
    },
  } as unknown as H3Event
}

describe('server Convex fetch helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearServerJwksCache()
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
    useEventMock.mockImplementation(() => {
      throw new Error('Nitro request context is not available')
    })
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
    const body = JSON.parse(String(init.body))
    expect(body.path).toBe('notes:list')
    expect(body.args.limit).toBe(5)
    expect(body.args.__trellis).toBeUndefined()
  })

  it('applies the shared server fetch timeout to Convex HTTP calls', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return new Response(JSON.stringify({ value: { ok: true } }), {
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      serverConvexQuery(createEvent(), { _path: 'notes:list' } as never, {} as never),
    ).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resolves the current Nitro event when the event argument is omitted', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    useEventMock.mockReturnValue(createEvent() as never)

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

    const body = JSON.parse(String(init.body))
    expect(body.args.__trellis).toBeUndefined()
  })

  it('does not inject Trellis metadata into mutation args', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexMutation(
      createEvent(),
      { _path: 'notes:add' } as never,
      { title: 'Hello' } as never,
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.args).toEqual({ title: 'Hello' })
    expect(body.args.__trellis).toBeUndefined()
  })

  it('does not inject Trellis metadata into action args', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexAction(createEvent(), { _path: 'notes:sync' } as never, { id: 'n1' } as never)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.args).toEqual({ id: 'n1' })
    expect(body.args.__trellis).toBeUndefined()
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

  it('does not misidentify args with node/headers as H3Event', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    useEventMock.mockReturnValue(createEvent() as never)

    // Args with 'headers' or 'node' should NOT be mistaken for an H3 event
    await serverConvexQuery(
      { _path: 'messages:byHeaders' } as never,
      { headers: ['x-custom'] } as never,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.path).toBe('messages:byHeaders')
    expect(body.args).toEqual({
      headers: ['x-custom'],
    })
  })

  it('sends identical query args for identical business queries', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Response(JSON.stringify({ value: { ok: true, body: init?.body } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(createEvent(), { _path: 'notes:list' } as never, { limit: 5 } as never)
    await serverConvexQuery(createEvent(), { _path: 'notes:list' } as never, { limit: 5 } as never)

    const [, firstInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const [, secondInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    const firstBody = JSON.parse(String(firstInit.body))
    const secondBody = JSON.parse(String(secondInit.body))

    expect(firstBody.args.limit).toBe(5)
    expect(secondBody.args.limit).toBe(5)
    expect(firstBody.args.__trellis).toBeUndefined()
    expect(secondBody.args.__trellis).toBeUndefined()
    expect(firstBody.args).toEqual(secondBody.args)
  })

  it('reuses one correlation id and configured service between request propagation and emitted events', async () => {
    const capture = createObservationCapture()
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Response(JSON.stringify({ value: { ok: true, body: init?.body } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    useRuntimeConfigMock.mockReturnValue({
      public: {
        convex: {
          url: 'http://127.0.0.1:3210',
          siteUrl: 'http://127.0.0.1:3220',
          observability: {
            enabled: true,
            service: 'test-service',
            level: 'verbose',
            capture: {
              backend: true,
              mcp: true,
              browser: false,
            },
          },
        },
      },
    })

    await serverConvexMutation(
      createEvent(),
      { _path: 'notes:add' } as never,
      { title: 'Observed' } as never,
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.args.__trellis).toBeUndefined()
    const correlationId = (
      capture.events.find((event) => event.name === 'mutation.completed') as
        | {
            correlationId?: string
          }
        | undefined
    )?.correlationId
    expect(correlationId).toBeTypeOf('string')
    expect(capture.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'mutation.completed',
          transport: 'nuxt-server',
          service: 'test-service',
          correlationId,
        }),
      ]),
    )
    capture.stop()
  })

  it('auth:auto exchanges cookie for token and attaches bearer header', async () => {
    const token = await mintServerJwt(
      { sub: 'user-auto', name: 'Auto User' },
      { issuer: 'http://127.0.0.1:3220' },
    )
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/api/auth/convex/jwks')) {
        return await createServerJwksResponse()
      }

      return new Response(JSON.stringify({ value: { ok: true } }), {
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(
      createEvent('better-auth.session_token=session123'),
      { _path: 'notes:list' } as never,
      {} as never,
      { auth: 'auto' },
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const authCall = fetchMock.mock.calls[0]
    expect(authCall).toBeDefined()
    const [authUrl, authInit] = authCall as unknown as [string, RequestInit]
    expect(authUrl).toBe('http://127.0.0.1:3220/api/auth/convex/token')
    expect(authInit.headers).toMatchObject({
      Cookie: 'better-auth.session_token=session123',
    })

    const jwksCall = fetchMock.mock.calls[1]
    expect(String(jwksCall?.[0] ?? '')).toBe('http://127.0.0.1:3220/api/auth/convex/jwks')

    const queryCall = fetchMock.mock.calls[2]
    expect(queryCall).toBeDefined()
    const [, init] = queryCall as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
    })
  })

  it('auth:trusted injects a signed identity forwarding envelope instead of bearer auth', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'identity-forwarding-key-with-enough-entropy'

    await serverConvexMutation(
      createEvent(),
      { _path: 'tasks:create' } as never,
      { title: 'From webhook' } as never,
      {
        auth: 'trusted',
        caller: {
          kind: 'user',
          userId: 'user_admin',
          subject: 'user:user_admin',
        },
      },
    )

    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
    })
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    const body = JSON.parse(String(init.body))
    expect(body.path).toBe('tasks:create')
    expect(body.args).toMatchObject({
      title: 'From webhook',
    })
    expect(body.args).not.toHaveProperty('caller')
    expect(body.args).not.toHaveProperty('_identityForwardingKey')
    expect(body.args).not.toHaveProperty('_identityForwarding')
    expect(typeof body.args._trellisForwarding).toBe('string')

    expect(
      verifyIdentityForwardingEnvelope(body.args._trellisForwarding, {
        keys: { default: 'identity-forwarding-key-with-enough-entropy' },
        expectedIssuer: 'trellis://server',
        expectedAudience: 'trellis://convex',
        functionRef: 'tasks:create',
        args: body.args,
      }),
    ).toMatchObject({
      sub: 'user:user_admin',
      caller: {
        kind: 'user',
        userId: 'user_admin',
        subject: 'user:user_admin',
      },
    })
  })

  it('auth:trusted can bind operation-execute envelopes to the confirmation jti', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'identity-forwarding-key-with-enough-entropy'

    await serverConvexMutation(
      createEvent(),
      { _path: 'tasks:delete' } as never,
      { id: 'task_1' } as never,
      {
        auth: 'trusted',
        caller: {
          kind: 'agent',
          agentId: 'assistant',
          subject: 'agent:assistant',
        },
        identityForwardingEnvelope: {
          purpose: 'operation-execute',
          jti: 'confirmation-jti-1',
        },
      },
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    const payload = verifyIdentityForwardingEnvelope(body.args._trellisForwarding, {
      keys: { default: 'identity-forwarding-key-with-enough-entropy' },
      expectedIssuer: 'trellis://server',
      expectedAudience: 'trellis://convex',
      functionRef: 'tasks:delete',
      args: body.args,
    })

    expect(payload).toMatchObject({
      purpose: 'operation-execute',
      jti: 'confirmation-jti-1',
      sub: 'agent:assistant',
    })
  })

  it('auth:trusted requires an explicit caller', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'identity-forwarding-key-123'

    await expect(
      serverConvexMutation(
        createEvent(),
        { _path: 'tasks:create' } as never,
        { title: 'From webhook' } as never,
        { auth: 'trusted' },
      ),
    ).rejects.toThrow('requires `options.caller`')
  })

  it('auth:trusted rejects weak identity forwarding keys in production', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    process.env.NODE_ENV = 'production'
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'identity-forwarding-key-123'

    await expect(
      serverConvexMutation(
        createEvent(),
        { _path: 'tasks:create' } as never,
        { title: 'From webhook' } as never,
        {
          auth: 'trusted',
          caller: {
            kind: 'user',
            userId: 'user_admin',
            subject: 'user:user_admin',
          },
        },
      ),
    ).rejects.toThrow(/at least 32 characters/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('auth:trusted rejects anonymous or subject-less forwarded principals', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'identity-forwarding-key-123'

    await expect(
      serverConvexMutation(
        createEvent(),
        { _path: 'tasks:create' } as never,
        { title: 'From webhook' } as never,
        {
          auth: 'trusted',
          caller: { kind: 'anonymous', subject: 'system:anonymous' } as never,
        },
      ),
    ).rejects.toThrow(/non-anonymous forwarded `caller`/i)

    await expect(
      serverConvexMutation(
        createEvent(),
        { _path: 'tasks:create' } as never,
        { title: 'From webhook' } as never,
        {
          auth: 'trusted',
          caller: { kind: 'agent' } as never,
        },
      ),
    ).rejects.toThrow(/forwarded `caller\.subject`/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects forwarded identity fields on non-trusted server helper calls', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      serverConvexMutation(
        createEvent(),
        { _path: 'tasks:create' } as never,
        {
          title: 'From webhook',
          caller: {
            kind: 'user',
            userId: 'user_admin',
            subject: 'user:user_admin',
          },
        } as never,
        { auth: 'auto' },
      ),
    ).rejects.toThrow(/Forwarded identity fields are only allowed with `auth: 'trusted'`/i)

    await expect(
      serverConvexMutation(
        createEvent(),
        { _path: 'tasks:create' } as never,
        {
          title: 'From webhook',
          _trellisForwarding: 'forged',
        } as never,
        { auth: 'none' },
      ),
    ).rejects.toThrow(/Forwarded identity fields are only allowed with `auth: 'trusted'`/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reuses one auth resolution across multiple serverConvex calls in the same request', async () => {
    const event = createEvent('better-auth.session_token=session123')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/convex/token')) {
        return new Response(JSON.stringify({ token: 'auto.jwt.token' }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ value: { ok: true } }), {
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(event, { _path: 'notes:list' } as never, {} as never, { auth: 'auto' })
    await serverConvexMutation(
      event,
      { _path: 'notes:add' } as never,
      { title: 'Hello' } as never,
      {
        auth: 'auto',
      },
    )

    expect(
      fetchMock.mock.calls.filter((call) =>
        String((call as unknown[])[0]).endsWith('/api/auth/convex/token'),
      ),
    ).toHaveLength(1)
  })

  it('reuses one correlation id across multiple serverConvex calls in the same request', async () => {
    const event = createEvent('better-auth.session_token=session123')
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: { ok: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(event, { _path: 'notes:list' } as never, { limit: 1 } as never)
    await serverConvexMutation(event, { _path: 'notes:add' } as never, { title: 'Hello' } as never)

    const bodies = fetchMock.mock.calls
      .filter(
        (call) =>
          String((call as unknown[])[0]).includes('/api/query') ||
          String((call as unknown[])[0]).includes('/api/mutation'),
      )
      .map((call) => JSON.parse(String(((call as unknown[])[1] as RequestInit).body)))
    expect(bodies[0].args.__trellis).toBeUndefined()
    expect(bodies[1].args.__trellis).toBeUndefined()
    expect((event.context as Record<string, unknown>).__trellis).toMatchObject({
      correlationId: expect.any(String),
      originTransport: 'nuxt-server',
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
    vi.stubGlobal('fetch', fetchMock)

    await serverConvexQuery(
      createEvent('better-auth.session_token=session123'),
      { _path: 'notes:list' } as never,
      {} as never,
      { auth: 'none' },
    )

    expect(
      fetchMock.mock.calls.filter((call) =>
        String((call as unknown[])[0]).endsWith('/api/auth/convex/token'),
      ),
    ).toHaveLength(0)
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
    })
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})
