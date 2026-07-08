import { afterEach, describe, expect, it, vi } from 'vitest'

import { useNuxtApp, useState } from '#imports'

import {
  createConvexAuthEngine,
  type AuthClientWithConvex,
  type ConvexAuthEngine,
} from '../../src/runtime/auth/client-engine'
import { createConvexPaginatedQueryState } from '../../src/runtime/composables/useConvexPaginatedQuery'
import { createConvexQueryState } from '../../src/runtime/composables/useConvexQuery'
import {
  getQueryKey,
  getSubscriptionCache,
  withAuthDimension,
} from '../../src/runtime/utils/convex-cache'
import type { ConvexUser } from '../../src/runtime/utils/types'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function createAuthClient(signOut: () => Promise<unknown>): AuthClientWithConvex {
  return {
    signOut: vi.fn(signOut),
    convex: { token: vi.fn() },
  } as unknown as AuthClientWithConvex
}

function createEngine(authClient: AuthClientWithConvex): ConvexAuthEngine {
  const nuxtApp = useNuxtApp()
  const token = useState<string | null>('convex:token', () => 'old.jwt')
  const user = useState<ConvexUser | null>('convex:user', () => ({
    id: 'old-user',
    name: 'Old User',
    email: 'old@example.com',
  }))
  const pending = useState<boolean>('convex:pending', () => false)
  const authError = useState<string | null>('convex:error', () => null)

  token.value = 'old.jwt'
  user.value = {
    id: 'old-user',
    name: 'Old User',
    email: 'old@example.com',
  }
  pending.value = false
  authError.value = null

  return createConvexAuthEngine({
    nuxtApp,
    authClient,
    state: { token, user, pending, authError },
    isAuthEnabled: true,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('client auth engine sign-out lifecycle (Nuxt runtime)', () => {
  it('purges private data while preserving public live and HTTP-only consumers', async () => {
    const convex = new MockConvexClient()
    const publicQuery = mockFnRef<'query'>('notes:lifecycle:public')
    const privateQuery = mockFnRef<'query'>('notes:lifecycle:private')
    const privateKeepQuery = mockFnRef<'query'>('notes:lifecycle:private-keep')
    const publicHttpQuery = mockFnRef<'query'>('notes:lifecycle:public-http')
    const publicPaginatedQuery = mockFnRef<'query'>('notes:lifecycle:public-paginated')
    const mixedQuery = mockFnRef<'query'>('notes:lifecycle:mixed')
    const publicHttpKey = getQueryKey(publicHttpQuery, {})

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = (init?.body ?? {}) as { path?: string }
      if (body.path === 'notes:lifecycle:public-http') {
        return { value: [{ _id: 'http-public', v: 1 }] }
      }
      throw new Error(`unexpected fetch: ${body.path ?? '<missing>'}`)
    })
    vi.stubGlobal('$fetch', fetchMock)

    const authClient = createAuthClient(async () => ({ data: { success: true }, error: null }))

    const { result, nuxtApp, flush } = await captureInNuxt(
      () => {
        const engine = createEngine(authClient)
        const publicResult = createConvexQueryState(
          publicQuery,
          {},
          { auth: 'none' },
          true,
        ).resultData
        const privateResult = createConvexQueryState(
          privateQuery,
          {},
          { auth: 'auto' },
          true,
        ).resultData
        const privateKeepResult = createConvexQueryState(
          privateKeepQuery,
          {},
          { auth: 'auto', keepPreviousData: true },
          true,
        ).resultData
        const publicHttpResult = createConvexQueryState(
          publicHttpQuery,
          {},
          { auth: 'none', subscribe: false },
          true,
        ).resultData
        const publicPaginatedResult = createConvexPaginatedQueryState(
          publicPaginatedQuery as never,
          {},
          { auth: 'none', initialNumItems: 2 },
          true,
        ).resultData
        const mixedPrivateResult = createConvexQueryState(
          mixedQuery,
          {},
          { auth: 'auto' },
          true,
        ).resultData
        const mixedPublicResult = createConvexQueryState(
          mixedQuery,
          {},
          { auth: 'none' },
          true,
        ).resultData
        return {
          engine,
          publicResult,
          privateResult,
          privateKeepResult,
          publicHttpResult,
          publicPaginatedResult,
          mixedPrivateResult,
          mixedPublicResult,
        }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
        payloadData: {
          [publicHttpKey]: [{ _id: 'http-public', v: 1 }],
        },
      },
    )

    await flush()
    convex.emitQueryResult(publicQuery, {}, [{ _id: 'public', v: 1 }])
    convex.emitQueryResult(privateQuery, {}, [{ _id: 'private', secret: true }])
    convex.emitQueryResult(privateKeepQuery, {}, [{ _id: 'private-keep', secret: true }])
    convex.emitQueryResult(mixedQuery, {}, [{ _id: 'mixed', v: 1 }])
    convex.emitQueryResultByPath('notes:lifecycle:public-paginated', {
      page: [{ _id: 'page-public', v: 1 }],
      isDone: true,
      continueCursor: null,
    })
    await flush()

    expect(result.publicResult.data.value).toEqual([{ _id: 'public', v: 1 }])
    expect(result.privateResult.data.value).toEqual([{ _id: 'private', secret: true }])
    expect(result.privateKeepResult.data.value).toEqual([{ _id: 'private-keep', secret: true }])
    expect(result.publicHttpResult.data.value).toEqual([{ _id: 'http-public', v: 1 }])
    expect(result.publicPaginatedResult.results.value).toEqual([{ _id: 'page-public', v: 1 }])
    expect(result.mixedPublicResult.data.value).toEqual([{ _id: 'mixed', v: 1 }])

    await result.engine.signOut()
    await flush()

    const publicKey = withAuthDimension(getQueryKey(publicQuery, {}), 'none')
    const privateKey = withAuthDimension(getQueryKey(privateQuery, {}), 'auto')
    const mixedRawKey = getQueryKey(mixedQuery, {})
    const mixedPublicKey = withAuthDimension(mixedRawKey, 'none')
    const mixedPrivateKey = withAuthDimension(mixedRawKey, 'auto')

    expect(getSubscriptionCache(nuxtApp).has(publicKey)).toBe(true)
    expect(getSubscriptionCache(nuxtApp).has(privateKey)).toBe(false)
    expect(getSubscriptionCache(nuxtApp).has(mixedPublicKey)).toBe(true)
    expect(getSubscriptionCache(nuxtApp).has(mixedPrivateKey)).toBe(false)

    expect(result.privateResult.data.value).toBeNull()
    expect(result.privateResult.status.value).toBe('idle')
    expect(result.privateKeepResult.data.value).toBeNull()
    expect(result.publicHttpResult.data.value).toEqual([{ _id: 'http-public', v: 1 }])
    expect(nuxtApp.payload.data[publicHttpKey]).toEqual([{ _id: 'http-public', v: 1 }])
    expect(result.publicPaginatedResult.results.value).toEqual([{ _id: 'page-public', v: 1 }])

    convex.emitQueryResult(publicQuery, {}, [{ _id: 'public', v: 2 }])
    convex.emitQueryResult(mixedQuery, {}, [{ _id: 'mixed', v: 2 }])
    await flush()

    expect(result.publicResult.data.value).toEqual([{ _id: 'public', v: 2 }])
    expect(result.mixedPublicResult.data.value).toEqual([{ _id: 'mixed', v: 2 }])
  })

  it('leaves identity and subscriptions live when upstream sign-out fails', async () => {
    const convex = new MockConvexClient()
    const publicQuery = mockFnRef<'query'>('notes:lifecycle:failure-public')
    const privateQuery = mockFnRef<'query'>('notes:lifecycle:failure-private')
    const authClient = createAuthClient(async () => {
      throw new Error('session still active')
    })

    const { result, nuxtApp, flush } = await captureInNuxt(
      () => {
        const engine = createEngine(authClient)
        const token = useState<string | null>('convex:token')
        const user = useState<ConvexUser | null>('convex:user')
        const authError = useState<string | null>('convex:error')
        const publicResult = createConvexQueryState(
          publicQuery,
          {},
          { auth: 'none' },
          true,
        ).resultData
        const privateResult = createConvexQueryState(
          privateQuery,
          {},
          { auth: 'auto' },
          true,
        ).resultData
        return { engine, token, user, authError, publicResult, privateResult }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    await flush()
    convex.emitQueryResult(publicQuery, {}, [{ _id: 'public', v: 1 }])
    convex.emitQueryResult(privateQuery, {}, [{ _id: 'private', v: 1 }])
    await flush()

    await expect(result.engine.signOut()).rejects.toThrow('session still active')
    await flush()

    expect(result.token.value).toBe('old.jwt')
    expect(result.user.value?.id).toBe('old-user')
    expect(result.authError.value).toBe('session still active')
    expect(
      getSubscriptionCache(nuxtApp).has(withAuthDimension(getQueryKey(publicQuery, {}), 'none')),
    ).toBe(true)
    expect(
      getSubscriptionCache(nuxtApp).has(withAuthDimension(getQueryKey(privateQuery, {}), 'auto')),
    ).toBe(true)

    convex.emitQueryResult(publicQuery, {}, [{ _id: 'public', v: 2 }])
    convex.emitQueryResult(privateQuery, {}, [{ _id: 'private', v: 2 }])
    await flush()
    expect(result.publicResult.data.value).toEqual([{ _id: 'public', v: 2 }])
    expect(result.privateResult.data.value).toEqual([{ _id: 'private', v: 2 }])
  })

  it('does not preserve the old identity when refreshAuth races sign-out', async () => {
    const signOutResult = deferred<{ data: { success: true }; error: null }>()
    const authClient = createAuthClient(() => signOutResult.promise)

    const { result, flush } = await captureInNuxt(
      () => {
        const engine = createEngine(authClient)
        const token = useState<string | null>('convex:token')
        const user = useState<ConvexUser | null>('convex:user')
        return { engine, token, user }
      },
      {
        convex: new MockConvexClient(),
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    const signOut = result.engine.signOut()
    await flush()
    const refresh = result.engine.refreshAuth()

    signOutResult.resolve({ data: { success: true }, error: null })
    const settled = await Promise.allSettled([signOut, refresh])
    await flush()

    expect(settled[0].status).toBe('fulfilled')
    expect(settled[1].status).toBe('rejected')
    expect(result.token.value).toBeNull()
    expect(result.user.value).toBeNull()
  })
})
