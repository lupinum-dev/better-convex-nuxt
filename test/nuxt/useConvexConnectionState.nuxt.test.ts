import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createConvexClientOwner,
  type OwnedConvexClient,
} from '../../src/runtime/client-core/client-owner'
import { useConvexConnectionState } from '../../src/runtime/composables/useConvexConnectionState'
import { MockConvexClient } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

/**
 * `useConvexConnectionState` now observes the CURRENT primary through the per-app
 * client owner (architecture invariant) rather than reading `$convex` and a
 * module-level store. These tests provide an owner wrapping the mock client.
 */
function ownerFor(convex: MockConvexClient) {
  return createConvexClientOwner({
    primaryFactory: () => convex as unknown as OwnedConvexClient,
  })
}

describe('useConvexConnectionState (Nuxt runtime)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('suppresses offline UI during hydration grace window', async () => {
    const realSetTimeout = globalThis.setTimeout
    let finishHydration: (() => void) | undefined
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((handler, delay, ...args) => {
      if (delay === 500 && typeof handler === 'function') {
        finishHydration = () => handler(...args)
        return 1 as unknown as ReturnType<typeof setTimeout>
      }

      return realSetTimeout(handler, delay, ...args)
    })
    const convex = new MockConvexClient()
    const owner = ownerFor(convex)

    const { result, wrapper } = await captureInNuxt(() => useConvexConnectionState(), { owner })

    expect(result.shouldShowOfflineUi.value).toBe(false)

    expect(finishHydration).toBeTypeOf('function')
    finishHydration?.()
    await Promise.resolve()

    expect(result.shouldShowOfflineUi.value).toBe(true)
    wrapper.unmount()
  })

  it('shares one connection-state subscription for multiple consumers', async () => {
    const convex = new MockConvexClient()
    const owner = ownerFor(convex)

    const { result, wrapper } = await captureInNuxt(
      () => ({
        first: useConvexConnectionState(),
        second: useConvexConnectionState(),
      }),
      { owner },
    )

    expect(result.first.isConnected.value).toBe(false)
    expect(result.second.isConnected.value).toBe(false)

    // The owner holds exactly one underlying subscription for both consumers.
    expect(convex.connectionSubscriberCount()).toBe(1)

    convex.updateConnectionState({
      isWebSocketConnected: true,
      hasEverConnected: true,
      connectionCount: 1,
    })

    expect(result.first.isConnected.value).toBe(true)
    expect(result.second.isConnected.value).toBe(true)
    expect(result.first.isReconnecting.value).toBe(false)
    expect(result.first.pendingMutations.value).toBe(0)
    expect(result.second.pendingActions.value).toBe(0)

    wrapper.unmount()
    // Every consumer released → the owner drops the underlying subscription.
    expect(convex.connectionSubscriberCount()).toBe(0)
  })
})
