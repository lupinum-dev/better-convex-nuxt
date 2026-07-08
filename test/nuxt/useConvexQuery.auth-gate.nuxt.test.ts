import { afterEach, describe, expect, it, vi } from 'vitest'

import { useState } from '#imports'

import { createConvexQueryState } from '../../src/runtime/composables/useConvexQuery'
import {
  getQueryKey,
  getSubscriptionCache,
  withAuthDimension,
} from '../../src/runtime/utils/convex-cache'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

const { acquireQuerySubscriptionMock, queryLogMock, testLogger } = vi.hoisted(() => {
  const logger = {
    auth: vi.fn(),
    query: vi.fn(),
    mutation: vi.fn(),
    action: vi.fn(),
    connection: vi.fn(),
    upload: vi.fn(),
    debug: vi.fn(),
    time: vi.fn(() => vi.fn()),
  }

  return {
    acquireQuerySubscriptionMock: vi.fn(),
    queryLogMock: logger.query,
    testLogger: logger,
  }
})

vi.mock('../../src/runtime/utils/convex-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/utils/convex-cache')>()
  const acquireQuerySubscription = (
    ...args: Parameters<typeof actual.acquireQuerySubscription>
  ): ReturnType<typeof actual.acquireQuerySubscription> => {
    acquireQuerySubscriptionMock(...args)
    return actual.acquireQuerySubscription(...args)
  }

  return {
    ...actual,
    acquireQuerySubscription,
  }
})

vi.mock('../../src/runtime/utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/utils/logger')>()
  return {
    ...actual,
    getSharedLogger: () => testLogger,
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

// F-1 regression: with module auth ENABLED and an `auth: 'auto'` query, an auth
// transition that settles signed-out (pending true -> false, no token) must never
// acquire a WebSocket subscription — least of all under the shared `convex:idle:*`
// cache key. See AUDIT_REPORT F-1.
describe('useConvexQuery auth gate (F-1)', () => {
  it('does not enter subscription setup while auth is still pending', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:auth-pending-primary-gate')

    const { result, flush, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => true)
        const token = useState<string | null>('convex:token', () => null)
        const query$ = createConvexQueryState(query, {}, { auth: 'auto' }, true).resultData
        return { pending, query$, token }
      },
      {
        convex,
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    await flush()
    expect(acquireQuerySubscriptionMock).not.toHaveBeenCalled()
    expect(queryLogMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'error',
        error: expect.objectContaining({
          message: expect.stringContaining('attempted to subscribe while query is idle'),
        }),
      }),
    )

    result.pending.value = false
    result.token.value = null
    await flush()

    expect(acquireQuerySubscriptionMock).not.toHaveBeenCalled()
    expect(queryLogMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'error',
        error: expect.objectContaining({
          message: expect.stringContaining('attempted to subscribe while query is idle'),
        }),
      }),
    )
    wrapper.unmount()
  })

  it('never subscribes when auth settles signed-out, then subscribes exactly once on sign-in', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:auth-gate')

    const { result, nuxtApp, flush } = await captureInNuxt(
      () => {
        // Start auth pending (client-unknown), no token yet.
        const pending = useState<boolean>('convex:pending', () => true)
        const token = useState<string | null>('convex:token', () => null)
        const query$ = createConvexQueryState(query, {}, { auth: 'auto' }, true).resultData
        return { query$, pending, token }
      },
      {
        convex,
        // Module auth enabled; query defaults auth:'auto' (the harness default of
        // auth:'none' would test nothing here).
        convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } },
      },
    )

    const { pending, token } = result

    // While auth is pending nothing subscribes (waitForAuth true).
    await flush()
    expect(convex.calls.onUpdate.length).toBe(0)

    // Auth settles signed-out: pending -> false with no token.
    pending.value = false
    await flush()

    // The bug: the waitForAuth watcher used to call setupSubscription() here,
    // acquiring an unauthenticated subscription under `convex:idle:<fn>`.
    expect(convex.calls.onUpdate.length).toBe(0)
    const cacheKeys = Array.from(getSubscriptionCache(nuxtApp).keys())
    expect(cacheKeys.some((key) => key.startsWith('convex:idle:'))).toBe(false)
    expect(cacheKeys.length).toBe(0)

    // Now the user signs in: a token appears. Exactly one live subscription exists
    // under the real args key (net of dedup churn), and never under an idle key.
    token.value = 'signed.in.jwt'
    await flush()

    expect(convex.activeListenerCount(query, {})).toBe(1)
    const expectedKey = withAuthDimension(getQueryKey(query, {}), 'auto')
    const keysAfterSignIn = Array.from(getSubscriptionCache(nuxtApp).keys())
    expect(keysAfterSignIn).toEqual([expectedKey])
    expect(keysAfterSignIn.some((key) => key.startsWith('convex:idle:'))).toBe(false)
  })
})
