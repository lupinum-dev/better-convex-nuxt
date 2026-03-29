import { describe, expect, it, vi } from 'vitest'

import { useNuxtApp } from '#imports'

import { useConvexConnectionState } from '../../src/runtime/composables/useConvexConnectionState'
import { MockConvexClient } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'

describe('useConvexConnectionState (Nuxt runtime)', () => {
  it('does not emit on initial boot and only emits when the connection phase changes', async () => {
    const convex = new MockConvexClient()
    const hookSpy = vi.fn()

    const { wrapper } = await captureInNuxt(() => {
      const nuxtApp = useNuxtApp()
      nuxtApp.hook('convex:connection:changed', hookSpy)
      return useConvexConnectionState()
    }, { convex })

    expect(hookSpy).not.toHaveBeenCalled()

    convex.updateConnectionState({
      hasInflightRequests: true,
      inflightMutations: 1,
    })

    expect(hookSpy).not.toHaveBeenCalled()

    convex.updateConnectionState({
      isWebSocketConnected: true,
      hasEverConnected: true,
      connectionCount: 1,
    })
    await Promise.resolve()

    expect(hookSpy).toHaveBeenCalledTimes(1)
    expect(hookSpy).toHaveBeenLastCalledWith({
      state: 'connected',
      previousState: 'connecting',
      connection: expect.objectContaining({
        isWebSocketConnected: true,
        hasEverConnected: true,
        connectionCount: 1,
      }),
      previousConnection: expect.objectContaining({
        isWebSocketConnected: false,
        hasEverConnected: false,
      }),
    })

    convex.updateConnectionState({
      inflightActions: 2,
    })

    expect(hookSpy).toHaveBeenCalledTimes(1)

    convex.updateConnectionState({
      isWebSocketConnected: false,
      hasEverConnected: true,
      connectionRetries: 1,
    })
    await Promise.resolve()

    expect(hookSpy).toHaveBeenCalledTimes(2)
    expect(hookSpy).toHaveBeenLastCalledWith({
      state: 'reconnecting',
      previousState: 'connected',
      connection: expect.objectContaining({
        isWebSocketConnected: false,
        hasEverConnected: true,
        connectionRetries: 1,
      }),
      previousConnection: expect.objectContaining({
        isWebSocketConnected: true,
        hasEverConnected: true,
      }),
    })

    convex.updateConnectionState({
      isWebSocketConnected: true,
      connectionCount: 2,
    })
    await Promise.resolve()

    expect(hookSpy).toHaveBeenCalledTimes(3)
    expect(hookSpy).toHaveBeenLastCalledWith({
      state: 'connected',
      previousState: 'reconnecting',
      connection: expect.objectContaining({
        isWebSocketConnected: true,
        connectionCount: 2,
      }),
      previousConnection: expect.objectContaining({
        isWebSocketConnected: false,
        connectionRetries: 1,
      }),
    })

    wrapper.unmount()
  })

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
