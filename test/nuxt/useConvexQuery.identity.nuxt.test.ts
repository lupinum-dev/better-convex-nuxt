import { afterEach, describe, expect, it, vi } from 'vitest'

import { useState } from '#imports'

import { toAuthenticatedIdentity, type AuthIdentity } from '../../src/runtime/auth/auth-identity'
import { createConvexQueryState } from '../../src/runtime/composables/useConvexQuery'
import { makeMockOwner } from '../helpers/mock-client-owner'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

afterEach(() => {
  vi.clearAllMocks()
})

// architecture invariant-7.4: identity-owned state clears synchronously on an
// identity change, keepPreviousData never crosses an identity boundary, and a
// result captured under a stale identity cannot commit after the switch.
describe('useConvexQuery identity isolation', () => {
  it('drops a deferred one-shot result resolved during the synchronous A-to-B window', async () => {
    const primary = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:deferred-once')
    let resolveA!: (value: unknown) => void
    let calls = 0
    primary.setQueryHandler('notes:deferred-once', () => {
      calls += 1
      return calls === 1
        ? new Promise((resolve) => (resolveA = resolve))
        : Promise.resolve({ owner: 'B' })
    })

    const { result, flush, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => false)
        const identity = useState<AuthIdentity>('convex:identity')
        pending.value = false
        identity.value = toAuthenticatedIdentity('jwt-A', { id: 'A' })
        const q = createConvexQueryState(
          query,
          {},
          { auth: 'optional', subscribe: false },
          true,
        ).resultData
        return { q, identity }
      },
      { owner: makeMockOwner(primary) },
    )

    const refresh = result.q.refresh()
    await Promise.resolve()
    result.identity.value = toAuthenticatedIdentity('jwt-B', { id: 'B' })
    resolveA({ owner: 'A' })
    await refresh
    expect(result.q.data.value).not.toEqual({ owner: 'A' })
    expect(result.q.error.value).toBeNull()

    await flush()
    wrapper.unmount()
  })

  it('clears data on A->B and never carries keepPreviousData across the boundary', async () => {
    const primary = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:mine')

    const { result, flush, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => false)
        const identity = useState<AuthIdentity>('convex:identity')
        pending.value = false
        identity.value = toAuthenticatedIdentity('jwt-A', { id: 'A' })
        const q = createConvexQueryState(
          query,
          {},
          { auth: 'optional', keepPreviousData: true },
          true,
        ).resultData
        return { q, pending, identity }
      },
      { owner: makeMockOwner(primary) },
    )

    await flush()

    // A's live result arrives.
    primary.emitQueryResultWhere(() => true, { owner: 'A' })
    await flush()
    expect(result.q.data.value).toEqual({ owner: 'A' })

    // Switch to user B.
    result.identity.value = toAuthenticatedIdentity('jwt-B', { id: 'B' })
    await flush()

    // A's data is gone and keepPreviousData did not carry it into B.
    expect(result.q.data.value).toBeNull()

    // B's result commits under B.
    primary.emitQueryResultWhere(() => true, { owner: 'B' })
    await flush()
    expect(result.q.data.value).toEqual({ owner: 'B' })

    wrapper.unmount()
  })

  it('rejects a stale-identity result captured under A after B becomes current', async () => {
    const primary = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:stale')

    const { result, flush, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => false)
        const identity = useState<AuthIdentity>('convex:identity')
        pending.value = false
        identity.value = toAuthenticatedIdentity('jwt-A', { id: 'A' })
        const q = createConvexQueryState(query, {}, { auth: 'optional' }, true).resultData
        return { q, pending, identity }
      },
      { owner: makeMockOwner(primary) },
    )

    await flush()
    primary.emitQueryResultWhere(() => true, { owner: 'A' })
    await flush()
    expect(result.q.data.value).toEqual({ owner: 'A' })

    // Capture A's live callback set, switch to B, then fire the stale A callback.
    // Because the composable tears down A's listener on the identity change, and
    // any surviving A-tagged commit is masked, no A value reappears under B.
    const lateA = primary.queuedQueryResultByPath('notes:stale', { owner: 'A-stale' })
    result.identity.value = toAuthenticatedIdentity('jwt-B', { id: 'B' })
    // A late emission targeting the (now-removed) A listener must not commit.
    lateA()
    await flush()
    expect(result.q.data.value).not.toEqual({ owner: 'A-stale' })
    expect(result.q.data.value).toBeNull()

    wrapper.unmount()
  })
})
