import { describe, expect, it } from 'vitest'

import { clearNuxtData, useState } from '#imports'

import { createConvexQueryState } from '../../src/runtime/composables/useConvexQuery'
import {
  clearAuthSubscriptions,
  getQueryKey,
  getSubscriptionCache,
} from '../../src/runtime/utils/convex-cache'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

// F-3 regression: sign-out purges cached Convex query payload so a later session
// cannot read the previous user's data, while live public (auth:'none') query keys
// are spared. Mirrors the exact clearing sequence in client-engine.signOut.
describe('sign-out purges Convex payload but spares live public keys (F-3)', () => {
  it('drops stale private payload keys and keeps mounted public query data', async () => {
    const convex = new MockConvexClient()
    const publicQuery = mockFnRef<'query'>('notes:list:public-purge')

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
        return { publicResult }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
        // A previous user's private query result left behind in the payload cache.
        payloadData: { 'convex:notes:get:stale-private': [{ _id: 'secret', v: 1 }] },
      },
    )

    await flush()
    convex.emitQueryResult(publicQuery, {}, [{ _id: 'p1', v: 1 }])
    await flush()

    const publicKey = getQueryKey(publicQuery, {})
    expect(result.publicResult.data.value).toEqual([{ _id: 'p1', v: 1 }])
    expect(nuxtApp.payload.data['convex:notes:get:stale-private']).toBeDefined()

    // Exact clearing sequence from client-engine.signOut.
    clearAuthSubscriptions(nuxtApp)
    const liveKeys = new Set(getSubscriptionCache(nuxtApp).keys())
    clearNuxtData((key) => key.startsWith('convex') && !liveKeys.has(key))
    await flush()

    // Stale private payload is gone.
    expect(nuxtApp.payload.data['convex:notes:get:stale-private']).toBeUndefined()

    // The live public query key was excluded, so its data survives and streams on.
    expect(liveKeys.has(publicKey)).toBe(true)
    expect(result.publicResult.data.value).toEqual([{ _id: 'p1', v: 1 }])
    convex.emitQueryResult(publicQuery, {}, [{ _id: 'p1', v: 2 }])
    await flush()
    expect(result.publicResult.data.value).toEqual([{ _id: 'p1', v: 2 }])
  })

  it('drops component data when an auth query transitions into signed-out (Part A)', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('notes:list:private-drop')

    const { result, flush } = await captureInNuxt(
      () => {
        useState<boolean>('convex:pending', () => false)
        const token = useState<string | null>('convex:token', () => 'signed.in.jwt')
        const authResult = createConvexQueryState(authQuery, {}, { auth: 'auto' }, true).resultData
        return { authResult, token }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    await flush()
    convex.emitQueryResult(authQuery, {}, [{ _id: 'a1', secret: true }])
    await flush()
    expect(result.authResult.data.value).toEqual([{ _id: 'a1', secret: true }])

    // Sign out: token cleared -> gate transitions 'none' -> 'auth-signed-out'.
    result.token.value = null
    await flush()

    expect(result.authResult.data.value).toBeNull()
    expect(result.authResult.status.value).toBe('idle')
  })
})
