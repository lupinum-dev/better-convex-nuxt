import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __getTrackedSubscriptionLeakKeysForTests,
  __recordSubscriptionUpdateForTests,
  clearSubscriptionLeakTracking,
  releaseTrackedSharedSubscription,
} from '../../src/runtime/convex/query/shared-query-subscription'
import { registerSubscription } from '../../src/runtime/convex/shared/convex-cache'

vi.mock('#imports', () => ({
  useNuxtApp: vi.fn(),
  watch: vi.fn(() => () => {}),
}))

describe('shared-query-subscription (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSubscriptionLeakTracking()
  })

  it('clears leak tracking only when the last shared subscription reference is released', () => {
    const nuxtApp = {}
    const unsubscribe = vi.fn()

    registerSubscription(nuxtApp as never, 'shared:notes:list', unsubscribe)
    registerSubscription(nuxtApp as never, 'shared:notes:list', vi.fn())
    __recordSubscriptionUpdateForTests('shared:notes:list')

    expect(__getTrackedSubscriptionLeakKeysForTests()).toEqual(['shared:notes:list'])

    expect(releaseTrackedSharedSubscription(nuxtApp as never, 'shared:notes:list')).toBe(false)
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(__getTrackedSubscriptionLeakKeysForTests()).toEqual(['shared:notes:list'])

    expect(releaseTrackedSharedSubscription(nuxtApp as never, 'shared:notes:list')).toBe(true)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(__getTrackedSubscriptionLeakKeysForTests()).toEqual([])
  })
})
