import type { FunctionReference } from 'convex/server'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConvexCallError } from '../../src/runtime/errors'
import {
  applyConvexAuthSsrHeaders,
  mergeVaryCookie,
} from '../../src/runtime/server/utils/ssr-auth-headers'

// ---------------------------------------------------------------------------
// Mocks for the caller's collaborators. ConvexHttpClient, the exchange
// primitive, the SSR auth cache, and runtime config are all replaced so the
// caller-scoped invariants (one client, one token promise, setAuth at most
// once) are observable via call counts.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  ctorCalls: [] as { address: string; options: unknown }[],
  setAuthCalls: [] as string[],
  queryMock: vi.fn(),
  mutationMock: vi.fn(),
  actionMock: vi.fn(),
  exchangeMock: vi.fn(),
  useRuntimeConfigMock: vi.fn(),
}))

vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    constructor(address: string, options: unknown) {
      mocks.ctorCalls.push({ address, options })
    }

    setAuth(token: string) {
      mocks.setAuthCalls.push(token)
    }

    query(...args: unknown[]) {
      return mocks.queryMock(...args)
    }

    mutation(...args: unknown[]) {
      return mocks.mutationMock(...args)
    }

    action(...args: unknown[]) {
      return mocks.actionMock(...args)
    }
  },
}))

vi.mock('../../src/runtime/server/utils/token-exchange', () => ({
  exchangeConvexToken: mocks.exchangeMock,
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: mocks.useRuntimeConfigMock,
}))

// Imported after the `vi.mock` calls above for readability (vitest hoists
// `vi.mock` to the top of the module regardless of source position, so this
// ordering has no runtime effect).
// eslint-disable-next-line import/first
import { serverConvex } from '../../src/runtime/server/utils/server-convex-caller'
// eslint-disable-next-line import/first
import { ServerConvexValidationError } from '../../src/runtime/server/utils/server-convex-options'

const SITE_URL = 'https://example.convex.site'
const CONVEX_URL = 'https://example.convex.cloud'

function setConfig(convex: Record<string, unknown>) {
  mocks.useRuntimeConfigMock.mockReturnValue({ public: { convex } })
}

function createEvent(cookie?: string): H3Event {
  return {
    context: { nitro: { runtimeConfig: mocks.useRuntimeConfigMock() } },
    node: { req: { headers: { ...(cookie ? { cookie } : {}) } } },
  } as unknown as H3Event
}

const AUTH_COOKIE = 'better-auth.session_token=session123'

beforeEach(() => {
  mocks.ctorCalls.length = 0
  mocks.setAuthCalls.length = 0
  mocks.queryMock.mockReset()
  mocks.mutationMock.mockReset()
  mocks.actionMock.mockReset()
  mocks.exchangeMock.mockReset()
  setConfig({ url: CONVEX_URL, siteUrl: SITE_URL, auth: {} })
})

type EmptyArgs = Record<string, never>
const queryRef = { _path: 'notes:list' } as unknown as FunctionReference<
  'query',
  'public',
  EmptyArgs,
  unknown
>
const mutationRef = { _path: 'notes:add' } as unknown as FunctionReference<
  'mutation',
  'public',
  EmptyArgs,
  unknown
>
const actionRef = { _path: 'notes:run' } as unknown as FunctionReference<
  'action',
  'public',
  EmptyArgs,
  unknown
>

describe('serverConvex caller-scoped invariants', () => {
  it('creates one token promise, one ConvexHttpClient, and calls setAuth at most once across calls', async () => {
    mocks.exchangeMock.mockResolvedValue({
      token: 'jwt-token',
      status: 200,
      error: null,
    })
    mocks.queryMock.mockResolvedValue(['a'])
    mocks.mutationMock.mockResolvedValue('id_1')

    const caller = serverConvex(createEvent(AUTH_COOKIE))
    await caller.query(queryRef, {})
    await caller.mutation(mutationRef, {})
    await caller.query(queryRef, {})

    expect(mocks.exchangeMock).toHaveBeenCalledTimes(1)
    expect(mocks.ctorCalls).toHaveLength(1)
    expect(mocks.ctorCalls[0]?.address).toBe(CONVEX_URL)
    expect(mocks.ctorCalls[0]?.options).toMatchObject({ logger: false })
    expect(mocks.setAuthCalls).toEqual(['jwt-token'])
  })

  it('constructs ConvexHttpClient with logger:false and a fetch function', async () => {
    mocks.exchangeMock.mockResolvedValue({
      token: 'jwt-token',
      status: 200,
      error: null,
    })
    mocks.queryMock.mockResolvedValue(null)

    await serverConvex(createEvent(AUTH_COOKIE)).query(queryRef, {})

    const options = mocks.ctorCalls[0]?.options as {
      logger: unknown
      fetch: unknown
    }
    expect(options.logger).toBe(false)
    expect(typeof options.fetch).toBe('function')
  })

  it('does not retry a failed token promise; a new caller can retry', async () => {
    mocks.exchangeMock.mockResolvedValue({
      token: null,
      status: 401,
      error: new ConvexCallError({
        kind: 'authentication',
        message: 'nope',
        status: 401,
      }),
    })

    const caller = serverConvex(createEvent(AUTH_COOKIE), { auth: 'required' })
    await expect(caller.query(queryRef, {})).rejects.toBeInstanceOf(ConvexCallError)
    await expect(caller.getToken()).rejects.toBeInstanceOf(ConvexCallError)
    expect(mocks.exchangeMock).toHaveBeenCalledTimes(1)

    const retryCaller = serverConvex(createEvent(AUTH_COOKIE), {
      auth: 'required',
    })
    await expect(retryCaller.getToken()).rejects.toBeInstanceOf(ConvexCallError)
    expect(mocks.exchangeMock).toHaveBeenCalledTimes(2)
  })

  it('explicit token bypasses exchange and is applied via setAuth', async () => {
    mocks.queryMock.mockResolvedValue('ok')

    await serverConvex(createEvent(), { authToken: 'explicit.jwt' }).query(queryRef, {})

    expect(mocks.exchangeMock).not.toHaveBeenCalled()
    expect(mocks.setAuthCalls).toEqual(['explicit.jwt'])
  })

  it('rejects an explicit token combined with optional/none before any network access', () => {
    expect(() => serverConvex(createEvent(), { authToken: 'x', auth: 'none' })).toThrow(
      ServerConvexValidationError,
    )
    expect(() => serverConvex(createEvent(), { authToken: 'x', auth: 'optional' })).toThrow(
      ServerConvexValidationError,
    )
    expect(mocks.exchangeMock).not.toHaveBeenCalled()
  })
})

describe('serverConvex auth-mode resolution', () => {
  it('required anonymous caller throws authentication 401 without calling the client', async () => {
    const caller = serverConvex(createEvent(), { auth: 'required' })
    await expect(caller.query(queryRef, {})).rejects.toMatchObject({
      kind: 'authentication',
      status: 401,
    })
    expect(mocks.queryMock).not.toHaveBeenCalled()
    expect(mocks.exchangeMock).not.toHaveBeenCalled()
  })

  it('optional anonymous caller executes without auth', async () => {
    mocks.queryMock.mockResolvedValue('anon')

    const result = await serverConvex(createEvent(), {
      auth: 'optional',
    }).query(queryRef, {})

    expect(result).toBe('anon')
    expect(mocks.setAuthCalls).toEqual([])
    expect(mocks.exchangeMock).not.toHaveBeenCalled()
  })

  it('optional cookie 401/403 executes anonymously', async () => {
    for (const status of [401, 403]) {
      mocks.setAuthCalls.length = 0
      mocks.exchangeMock.mockResolvedValue({
        token: null,
        status,
        error: new ConvexCallError({
          kind: 'authentication',
          message: 'x',
          status,
        }),
      })
      mocks.queryMock.mockResolvedValue('anon')

      const result = await serverConvex(createEvent(AUTH_COOKIE), {
        auth: 'optional',
      }).query(queryRef, {})
      expect(result).toBe('anon')
      expect(mocks.setAuthCalls).toEqual([])
    }
  })

  it('optional transport/5xx/malformed exchange fails as transport', async () => {
    for (const status of [undefined, 500]) {
      mocks.exchangeMock.mockResolvedValue({
        token: null,
        status,
        error: new ConvexCallError({
          kind: 'transport',
          message: 'boom',
          status,
        }),
      })
      await expect(
        serverConvex(createEvent(AUTH_COOKIE), { auth: 'optional' }).query(queryRef, {}),
      ).rejects.toMatchObject({ kind: 'transport' })
    }

    // 2xx with no token = malformed -> transport in optional mode too.
    mocks.exchangeMock.mockResolvedValue({
      token: null,
      status: 200,
      error: new ConvexCallError({
        kind: 'transport',
        message: 'no token',
        status: 200,
      }),
    })
    await expect(
      serverConvex(createEvent(AUTH_COOKIE), { auth: 'optional' }).query(queryRef, {}),
    ).rejects.toMatchObject({ kind: 'transport' })
  })

  it('explicit credential rejected 401/403 throws authentication and never downgrades', async () => {
    mocks.exchangeMock.mockResolvedValue({
      token: null,
      status: 403,
      error: new ConvexCallError({
        kind: 'authentication',
        message: 'x',
        status: 403,
      }),
    })

    const caller = serverConvex(createEvent(), {
      credential: { type: 'bearer', value: 'api-key' },
    })
    await expect(caller.query(queryRef, {})).rejects.toMatchObject({
      kind: 'authentication',
    })
    expect(mocks.queryMock).not.toHaveBeenCalled()
  })
})

describe('serverConvex boundary error sanitization', () => {
  const SENTINEL = 'SUPER_SECRET_UPSTREAM_BODY_9f8e7d'

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['query', () => mocks.queryMock, (c: ReturnType<typeof serverConvex>) => c.query(queryRef, {})],
    [
      'mutation',
      () => mocks.mutationMock,
      (c: ReturnType<typeof serverConvex>) => c.mutation(mutationRef, {}),
    ],
    [
      'action',
      () => mocks.actionMock,
      (c: ReturnType<typeof serverConvex>) => c.action(actionRef, {}),
    ],
  ] as const)(
    'keeps a sentinel upstream body out of the public %s error, JSON, and logs',
    async (_name, getMock, invoke) => {
      // Simulate ConvexHttpClient placing a raw non-OK upstream body in Error.message.
      getMock().mockRejectedValue(new Error(SENTINEL))
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      let caught: unknown
      try {
        await invoke(serverConvex(createEvent(), { auth: 'none' }))
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(ConvexCallError)
      const err = caught as ConvexCallError
      expect(err.kind).toBe('unknown')
      expect(err.message).toBe('Convex server call failed')
      expect(err.message).not.toContain(SENTINEL)
      expect(JSON.stringify(err.toJSON())).not.toContain(SENTINEL)
      expect(JSON.stringify(err)).not.toContain(SENTINEL)

      // Logging the public error (server-side console) must not leak the body.
      console.log(err)
      console.error(err)
      const captured = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
      const serialized = captured.map((call) => JSON.stringify(call)).join('|')
      expect(serialized).not.toContain(SENTINEL)
    },
  )

  it('preserves a Convex application error as server with data.code UNAUTHORIZED', async () => {
    const appError = Object.assign(new Error('unauthorized'), {
      [Symbol.for('ConvexError')]: true,
      data: { code: 'UNAUTHORIZED' },
    })
    mocks.queryMock.mockRejectedValue(appError)

    await expect(
      serverConvex(createEvent(), { auth: 'none' }).query(queryRef, {}),
    ).rejects.toMatchObject({ kind: 'server', code: 'UNAUTHORIZED' })
  })

  it('passes a classified transport error through unchanged', async () => {
    const transport = new ConvexCallError({
      kind: 'transport',
      message: 'net down',
    })
    mocks.queryMock.mockRejectedValue(transport)

    await expect(serverConvex(createEvent(), { auth: 'none' }).query(queryRef, {})).rejects.toBe(
      transport,
    )
  })
})

describe('SSR auth response headers (Vary/Cache-Control)', () => {
  it('merges Cookie into Vary while preserving existing values', () => {
    expect(mergeVaryCookie(undefined)).toBe('Cookie')
    expect(mergeVaryCookie('Accept-Encoding')).toBe('Accept-Encoding, Cookie')
    expect(mergeVaryCookie('Cookie')).toBe('Cookie')
    expect(mergeVaryCookie('cookie')).toBe('cookie')
    expect(mergeVaryCookie(['Accept-Encoding', 'Cookie'])).toBe('Accept-Encoding, Cookie')
  })

  it('appends Vary: Cookie and sets private/no-store for a token-bearing cookie response', () => {
    const headers = new Map<string, string>([['Vary', 'Accept-Encoding']])
    const event = {
      node: {
        res: {
          getHeader: (name: string) => headers.get(name),
          setHeader: (name: string, value: string) => headers.set(name, value),
        },
      },
    } as unknown as H3Event

    applyConvexAuthSsrHeaders(event, {
      authEnabled: true,
      hasBetterAuthCookie: true,
      serializesToken: true,
    })

    expect(headers.get('Vary')).toBe('Accept-Encoding, Cookie')
    expect(headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('does not set private/no-store without both a recognized cookie and a serialized token', () => {
    const headers = new Map<string, string>()
    const event = {
      node: {
        res: {
          getHeader: (name: string) => headers.get(name),
          setHeader: (name: string, value: string) => headers.set(name, value),
        },
      },
    } as unknown as H3Event

    applyConvexAuthSsrHeaders(event, {
      authEnabled: true,
      hasBetterAuthCookie: true,
      serializesToken: false,
    })

    expect(headers.get('Vary')).toBe('Cookie')
    expect(headers.has('Cache-Control')).toBe(false)
  })
})
