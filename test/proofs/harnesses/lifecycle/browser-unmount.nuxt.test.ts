/**
 * Lifecycle fixture: browser unmount (internal §17.2 / §20 Phase 0).
 *
 * Mounts a component that opens a subscription-shaped resource (modeled on
 * `MockConvexClient.onUpdate`, the same double used by the composable
 * suites in `test/nuxt`) inside `onMounted`, and releases it in
 * `onUnmounted`. Counts subscribe/unsubscribe calls — not just the last
 * visible query result — across a Vue component unmount.
 */
import { describe, expect, it } from 'vitest'
import { onMounted, onUnmounted } from 'vue'

import { MockConvexClient, mockFnRef } from '../../../helpers/mock-convex-client'
import { captureInNuxt } from '../../../helpers/nuxt-runtime-harness'

describe('lifecycle fixture: browser unmount', () => {
  it('balances subscribe/unsubscribe when a mounted component unmounts', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:lifecycle-unmount')

    const { wrapper } = await captureInNuxt(
      () => {
        onMounted(() => {
          const unsubscribe = convex.onUpdate(query, {}, () => {})
          onUnmounted(unsubscribe)
        })
        return true
      },
      { convex },
    )

    expect(convex.calls.onUpdate.length).toBe(1) // one subscribe on mount
    expect(convex.activeListenerCount()).toBe(1)

    wrapper.unmount()

    expect(convex.activeListenerCount()).toBe(0) // unsubscribed on unmount, not leaked
  })

  it('balances subscribe/unsubscribe across three independent mount/unmount cycles', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:lifecycle-repeat')

    for (let cycle = 0; cycle < 3; cycle++) {
      const { wrapper } = await captureInNuxt(
        () => {
          onMounted(() => {
            const unsubscribe = convex.onUpdate(query, {}, () => {})
            onUnmounted(unsubscribe)
          })
          return true
        },
        { convex },
      )

      expect(convex.activeListenerCount()).toBe(1)
      wrapper.unmount()
      expect(convex.activeListenerCount()).toBe(0)
    }

    expect(convex.calls.onUpdate.length).toBe(3) // three subscribes total, one per cycle
  })
})
