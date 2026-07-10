import { afterEach, describe, expect, it, vi } from 'vitest'

import { useState } from '#imports'

import { createConvexQueryState } from '../../src/runtime/composables/useConvexQuery'
import { makeMockOwner } from '../helpers/mock-client-owner'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

afterEach(() => {
  vi.clearAllMocks()
})

// vNext §6 / internal §7.3-7.4: identity-owned state clears synchronously on an
// identity change, keepPreviousData never crosses an identity boundary, and a
// result captured under a stale identity cannot commit after the switch.
describe('useConvexQuery identity isolation', () => {
  it('clears data on A->B and never carries keepPreviousData across the boundary', async () => {
    const primary = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:mine')

    const { result, flush, wrapper } = await captureInNuxt(
      () => {
        const pending = useState<boolean>('convex:pending', () => false)
        const user = useState<{ id: string } | null>('convex:user', () => null)
        pending.value = false
        user.value = { id: 'A' }
        const q = createConvexQueryState(
          query,
          {},
          { auth: 'optional', keepPreviousData: true },
          true,
        ).resultData
        return { q, pending, user }
      },
      { owner: makeMockOwner(primary) },
    )

    await flush()

    // A's live result arrives.
    primary.emitQueryResultWhere(() => true, { owner: 'A' })
    await flush()
    expect(result.q.data.value).toEqual({ owner: 'A' })

    // Switch to user B.
    result.user.value = { id: 'B' }
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
        const user = useState<{ id: string } | null>('convex:user', () => null)
        pending.value = false
        user.value = { id: 'A' }
        const q = createConvexQueryState(query, {}, { auth: 'optional' }, true).resultData
        return { q, pending, user }
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
    result.user.value = { id: 'B' }
    // A late emission targeting the (now-removed) A listener must not commit.
    primary.emitQueryResultWhere(() => true, { owner: 'A-stale' })
    await flush()
    expect(result.q.data.value).not.toEqual({ owner: 'A-stale' })
    expect(result.q.data.value).toBeNull()

    wrapper.unmount()
  })
})
