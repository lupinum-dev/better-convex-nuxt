import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  createConvexAuthEngine,
  type AuthClientWithConvex,
  type ConvexAuthEngineState,
} from '../../src/runtime/auth/client-engine'
import { getSubscription, registerSubscription } from '../../src/runtime/utils/convex-cache'

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${toBase64Url(
    JSON.stringify(payload),
  )}.signature`
}

function createNuxtApp() {
  const hooks = new Map<string, Array<() => void | Promise<void>>>()
  return {
    _convexRefreshAuthPromise: null as Promise<void> | null,
    hook: vi.fn((name: 'better-convex:auth:refresh', callback: () => void | Promise<void>) => {
      hooks.set(name, [...(hooks.get(name) ?? []), callback])
    }),
    callHook: vi.fn(async (name: 'better-convex:auth:refresh') => {
      for (const callback of hooks.get(name) ?? []) {
        await callback()
      }
    }),
  }
}

function createState(): ConvexAuthEngineState {
  return {
    token: ref(null),
    user: ref(null),
    pending: ref(true),
    authError: ref(null),
  }
}

function createClient() {
  let fetchToken:
    | ((args: { forceRefreshToken: boolean; signal?: AbortSignal }) => Promise<string | null>)
    | null = null

  return {
    client: {
      setAuth: vi.fn(
        (nextFetchToken: typeof fetchToken, onChange: (isAuthenticated: boolean) => void) => {
          fetchToken = nextFetchToken
          onChange(false)
        },
      ),
    },
    fetchToken: () => {
      if (!fetchToken) throw new Error('setAuth was not called')
      return fetchToken
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

describe('createConvexAuthEngine', () => {
  it('settles pending without attaching auth when auth is disabled', () => {
    const state = createState()
    const { client } = createClient()
    const engine = createConvexAuthEngine({
      nuxtApp: createNuxtApp(),
      authClient: null,
      state,
      isAuthEnabled: false,
    })

    engine.attachConvexClient(client as never)

    expect(state.pending.value).toBe(false)
    expect(client.setAuth).not.toHaveBeenCalled()
  })

  it('does not call Better Auth token endpoint for skipped routes', async () => {
    const state = createState()
    const authClient = {
      signOut: vi.fn(),
      convex: { token: vi.fn() },
    } as unknown as AuthClientWithConvex
    const { client, fetchToken } = createClient()
    const engine = createConvexAuthEngine({
      nuxtApp: createNuxtApp(),
      authClient,
      state,
      isAuthEnabled: true,
      getRoute: () => ({ path: '/public', meta: { skipConvexAuth: true } }),
    })

    engine.attachConvexClient(client as never)
    const token = await fetchToken()({ forceRefreshToken: false })

    expect(token).toBeNull()
    expect(authClient.convex.token).not.toHaveBeenCalled()
    expect(state.pending.value).toBe(false)
  })

  it('commits token and user state from the Better Auth Convex token endpoint', async () => {
    const token = makeJwt({
      sub: 'user_123',
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: true,
    })
    const state = createState()
    const authClient = {
      signOut: vi.fn(),
      convex: { token: vi.fn(async () => ({ data: { token } })) },
    } as unknown as AuthClientWithConvex
    const { client, fetchToken } = createClient()
    const engine = createConvexAuthEngine({
      nuxtApp: createNuxtApp(),
      authClient,
      state,
      isAuthEnabled: true,
      getRoute: () => ({ path: '/dashboard' }),
    })

    engine.attachConvexClient(client as never)
    const result = await fetchToken()({ forceRefreshToken: false })

    expect(result).toBe(token)
    expect(state.token.value).toBe(token)
    expect(state.user.value).toEqual({
      id: 'user_123',
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: true,
    })
    expect(state.authError.value).toBeNull()
    expect(state.pending.value).toBe(false)
  })

  it('replaces the user when a refreshed token belongs to a different account', async () => {
    const token = makeJwt({
      sub: 'user_456',
      name: 'Grace',
      email: 'grace@example.com',
      emailVerified: true,
    })
    const state = createState()
    state.token.value = makeJwt({
      sub: 'user_123',
      exp: Math.floor(Date.now() / 1000) + 1,
    })
    state.user.value = {
      id: 'user_123',
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: true,
    }
    const authClient = {
      signOut: vi.fn(),
      convex: { token: vi.fn(async () => ({ data: { token } })) },
    } as unknown as AuthClientWithConvex
    const { client, fetchToken } = createClient()
    const engine = createConvexAuthEngine({
      nuxtApp: createNuxtApp(),
      authClient,
      state,
      isAuthEnabled: true,
      getRoute: () => ({ path: '/dashboard' }),
    })

    engine.attachConvexClient(client as never)
    const result = await fetchToken()({ forceRefreshToken: true })

    expect(result).toBe(token)
    expect(state.token.value).toBe(token)
    expect(state.user.value).toEqual({
      id: 'user_456',
      name: 'Grace',
      email: 'grace@example.com',
      emailVerified: true,
    })
  })

  it('ignores a stale token response after signOut starts', async () => {
    const token = makeJwt({
      sub: 'user_123',
      name: 'Ada',
      email: 'ada@example.com',
    })
    const tokenResponse = deferred<{ data: { token: string } }>()
    const state = createState()
    const authClient = {
      signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
      convex: { token: vi.fn(() => tokenResponse.promise) },
    } as unknown as AuthClientWithConvex
    const { client, fetchToken } = createClient()
    const engine = createConvexAuthEngine({
      nuxtApp: createNuxtApp(),
      authClient,
      state,
      isAuthEnabled: true,
      getRoute: () => ({ path: '/dashboard' }),
    })

    engine.attachConvexClient(client as never)
    const pendingToken = fetchToken()({ forceRefreshToken: false })

    await engine.signOut()
    tokenResponse.resolve({ data: { token } })

    await expect(pendingToken).resolves.toBeNull()
    expect(state.token.value).toBeNull()
    expect(state.user.value).toBeNull()
    expect(state.authError.value).toBeNull()
    expect(client.setAuth).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent signOut calls', async () => {
    const signOutResult = deferred<{ data: { success: true }; error: null }>()
    const state = createState()
    state.token.value = 'existing.jwt.token'
    state.user.value = { id: 'u1', name: 'Ada', email: 'ada@example.com' }
    const authClient = {
      signOut: vi.fn(() => signOutResult.promise),
      convex: { token: vi.fn() },
    } as unknown as AuthClientWithConvex
    const { client } = createClient()
    const engine = createConvexAuthEngine({
      nuxtApp: createNuxtApp(),
      authClient,
      state,
      isAuthEnabled: true,
    })

    engine.attachConvexClient(client as never)
    const first = engine.signOut()
    const second = engine.signOut()
    signOutResult.resolve({ data: { success: true }, error: null })

    await expect(Promise.all([first, second])).resolves.toEqual([
      { data: { success: true }, error: null },
      { data: { success: true }, error: null },
    ])
    expect(authClient.signOut).toHaveBeenCalledTimes(1)
    expect(state.token.value).toBeNull()
    expect(state.user.value).toBeNull()
  })

  it('clears shared query subscriptions after successful signOut', async () => {
    const nuxtApp = createNuxtApp()
    const unsubscribe = vi.fn()
    const state = createState()
    state.token.value = 'existing.jwt.token'
    state.user.value = { id: 'u1', name: 'Ada', email: 'ada@example.com' }
    const authClient = {
      signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
      convex: { token: vi.fn() },
    } as unknown as AuthClientWithConvex
    const { client } = createClient()
    const engine = createConvexAuthEngine({
      nuxtApp,
      authClient,
      state,
      isAuthEnabled: true,
    })

    registerSubscription(nuxtApp, 'convex:query:private', unsubscribe)
    engine.attachConvexClient(client as never)

    await engine.signOut()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(getSubscription(nuxtApp, 'convex:query:private')).toBeUndefined()
  })
})
