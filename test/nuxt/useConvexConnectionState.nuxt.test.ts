import { describe, expect, it, vi } from 'vitest'

import { useConvexConnectionState } from '../../src/runtime/composables/useConvexConnectionState'
import { MockConvexClient } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

describe('useConvexConnectionState (Nuxt runtime)', () => {
  it('suppresses offline UI during hydration grace window', async () => {
    vi.useFakeTimers()
    const convex = new MockConvexClient()

    const { result, wrapper } = await captureInNuxt(() => useConvexConnectionState(), { convex })

    expect(result.shouldShowOfflineUi.value).toBe(false)

    vi.advanceTimersByTime(500)
    await Promise.resolve()

    expect(result.shouldShowOfflineUi.value).toBe(true)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('shares one connection-state subscription for multiple consumers', async () => {
    const convex = new MockConvexClient()

    const { result, wrapper } = await captureInNuxt(
      () => ({
        first: useConvexConnectionState(),
        second: useConvexConnectionState(),
      }),
      { convex },
    )

    expect(result.first.isConnected.value).toBe(false)
    expect(result.second.isConnected.value).toBe(false)

    convex.updateConnectionState({
      isWebSocketConnected: true,
      hasEverConnected: true,
      connectionCount: 1,
    })

    expect(result.first.isConnected.value).toBe(true)
    expect(result.second.isConnected.value).toBe(true)
    expect(result.first.isReconnecting.value).toBe(false)
    expect(result.first.pendingMutations.value).toBe(0)
    expect(result.second.state.value.inflightActions).toBe(0)

    wrapper.unmount()
    expect(convex.connectionSubscriberCount()).toBe(0)
  })
})
