import { describe, expect, it } from 'vitest'

import { defineSharedConvexQuery } from '../../src/runtime/composables/defineSharedConvexQuery'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { waitFor } from '../helpers/wait-for'

describe('defineSharedConvexQuery (Nuxt runtime)', () => {
  it('returns one shared query state per app instance for the same key', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('users:get-current:shared')

    const useSharedUser = defineSharedConvexQuery({
      key: 'current-user',
      query,
      args: {},
    })

    const { result, wrapper } = await captureInNuxt(() => {
      const first = useSharedUser()
      const second = useSharedUser()
      return { first, second }
    }, { convex })

    expect(result.first).toBe(result.second)

    convex.emitQueryResultByPath('users:get-current:shared', { id: 'u1' })
    await waitFor(() => result.first.data.value?.id === 'u1')
    await waitFor(() => convex.activeListenerCount(query, {}) === 1)
    expect(result.second.data.value?.id).toBe('u1')

    wrapper.unmount()
  })

  it('different keys create isolated shared query state', async () => {
    const query = mockFnRef<'query'>('users:get-current:shared:new-app')
    const useSharedUser = defineSharedConvexQuery({
      key: 'current-user:new-app',
      query,
      args: {},
    })
    const useSharedUserAlt = defineSharedConvexQuery({
      key: 'current-user:new-app:alt',
      query,
      args: {},
    })

    const { result } = await captureInNuxt(() => ({
      first: useSharedUser(),
      second: useSharedUserAlt(),
    }), { convex: new MockConvexClient() })

    expect(result.first).not.toBe(result.second)
  })

  it('throws when same key is registered with a different config object', async () => {
    const queryA = mockFnRef<'query'>('users:get-current:shared:collision-a')
    const queryB = mockFnRef<'query'>('users:get-current:shared:collision-b')

    const useSharedA = defineSharedConvexQuery({
      key: 'current-user:collision',
      query: queryA,
      args: {},
    })
    const useSharedB = defineSharedConvexQuery({
      key: 'current-user:collision',
      query: queryB,
      args: {},
    })

    await expect(captureInNuxt(() => {
      void useSharedA()
      void useSharedB()
      return null
    }, { convex: new MockConvexClient() })).rejects.toThrow(/duplicate key/i)
  })
})
