import { describe, expect, it } from 'vitest'

import { createSharedConvexQuery } from '../../src/runtime/composables/createSharedConvexQuery'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { waitFor } from '../helpers/wait-for'

describe('createSharedConvexQuery (Nuxt runtime)', () => {
  it('returns one shared query state per app instance for the same key', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('users:get-current:shared')

    const useSharedUser = createSharedConvexQuery({
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
    const useSharedUser = createSharedConvexQuery({
      key: 'current-user:new-app',
      query,
      args: {},
    })
    const useSharedUserAlt = createSharedConvexQuery({
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
})
