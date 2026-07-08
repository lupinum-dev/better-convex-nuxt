import { describe, expect, it } from 'vitest'

import { useState } from '#imports'

import { createConvexQueryState } from '../../src/runtime/composables/useConvexQuery'
import {
  clearAuthSubscriptions,
  getQueryKey,
  getSubscriptionCache,
  withAuthDimension,
} from '../../src/runtime/utils/convex-cache'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

// F-2 regression: sign-out clears only auth-carrying subscriptions. Public
// (auth: 'none') realtime queries are auth-independent and must keep streaming.
describe('clearAuthSubscriptions preserves public queries (F-2)', () => {
  it('spares auth:none subscriptions while tearing down auth:auto ones', async () => {
    const convex = new MockConvexClient()
    const publicQuery = mockFnRef<'query'>('notes:list:public')
    const authQuery = mockFnRef<'query'>('notes:list:private')

    const { result, nuxtApp, flush } = await captureInNuxt(
      () => {
        useState<boolean>('convex:pending', () => false)
        useState<string | null>('convex:token', () => 'signed.in.jwt')
        const publicResult = createConvexQueryState(
          publicQuery,
          {},
          { auth: 'none' },
          true,
        ).resultData
        const authResult = createConvexQueryState(authQuery, {}, { auth: 'auto' }, true).resultData
        return { publicResult, authResult }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    await flush()
    convex.emitQueryResult(publicQuery, {}, [{ _id: 'p1', v: 1 }])
    convex.emitQueryResult(authQuery, {}, [{ _id: 'a1', v: 1 }])
    await flush()

    const publicKey = withAuthDimension(getQueryKey(publicQuery, {}), 'none')
    const authKey = withAuthDimension(getQueryKey(authQuery, {}), 'auto')

    // Both subscribed before sign-out.
    expect(getSubscriptionCache(nuxtApp).has(publicKey)).toBe(true)
    expect(getSubscriptionCache(nuxtApp).has(authKey)).toBe(true)
    expect(result.publicResult.data.value).toEqual([{ _id: 'p1', v: 1 }])

    // Sign-out clearing sequence.
    clearAuthSubscriptions(nuxtApp)

    // Auth subscription gone; public subscription survives.
    expect(getSubscriptionCache(nuxtApp).has(authKey)).toBe(false)
    expect(getSubscriptionCache(nuxtApp).has(publicKey)).toBe(true)

    // Public query keeps streaming: a later emission still reaches the component.
    convex.emitQueryResult(publicQuery, {}, [{ _id: 'p1', v: 2 }])
    await flush()
    expect(result.publicResult.data.value).toEqual([{ _id: 'p1', v: 2 }])
  })

  it('does not alias the same query mounted as auth:auto and auth:none', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:mixed-auth')

    const { result, nuxtApp, flush } = await captureInNuxt(
      () => {
        useState<boolean>('convex:pending', () => false)
        useState<string | null>('convex:token', () => 'signed.in.jwt')
        const authResult = createConvexQueryState(query, {}, { auth: 'auto' }, true).resultData
        const publicResult = createConvexQueryState(query, {}, { auth: 'none' }, true).resultData
        return { publicResult, authResult }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    await flush()

    const rawKey = getQueryKey(query, {})
    const authKey = withAuthDimension(rawKey, 'auto')
    const publicKey = withAuthDimension(rawKey, 'none')
    expect(getSubscriptionCache(nuxtApp).has(authKey)).toBe(true)
    expect(getSubscriptionCache(nuxtApp).has(publicKey)).toBe(true)

    clearAuthSubscriptions(nuxtApp)
    expect(getSubscriptionCache(nuxtApp).has(authKey)).toBe(false)
    expect(getSubscriptionCache(nuxtApp).has(publicKey)).toBe(true)

    convex.emitQueryResult(query, {}, [{ _id: 'p1', v: 2 }])
    await flush()
    expect(result.publicResult.data.value).toEqual([{ _id: 'p1', v: 2 }])
  })
})
