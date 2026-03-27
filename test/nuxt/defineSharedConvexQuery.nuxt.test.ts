import { describe, expect, it } from 'vitest'

import { defineSharedConvexQuery } from '../../src/runtime/composables/defineSharedConvexQuery'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
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

    const { result, wrapper } = await captureInNuxt(
      () => {
        const first = useSharedUser()
        const second = useSharedUser()
        return { first, second }
      },
      { convex },
    )

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

    const { result } = await captureInNuxt(
      () => ({
        first: useSharedUser(),
        second: useSharedUserAlt(),
      }),
      { convex: new MockConvexClient() },
    )

    expect(result.first).not.toBe(result.second)
  })

  it('reuses existing shared state for equivalent duplicate key registration', async () => {
    const query = mockFnRef<'query'>('users:get-current:shared:equivalent')

    const useSharedA = defineSharedConvexQuery({
      key: 'current-user:equivalent',
      query,
      args: {},
    })
    const useSharedB = defineSharedConvexQuery({
      key: 'current-user:equivalent',
      query,
      args: {},
    })

    const { result } = await captureInNuxt(
      () => ({
        first: useSharedA(),
        second: useSharedB(),
      }),
      { convex: new MockConvexClient() },
    )

    expect(result.first).toBe(result.second)
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

    await expect(
      captureInNuxt(
        () => {
          void useSharedA()
          void useSharedB()
          return null
        },
        { convex: new MockConvexClient() },
      ),
    ).rejects.toThrow(/duplicate key/i)
  })

  it('auto-derives key from query name and shares state without explicit key', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('users:get-current:shared:auto-key')

    const useSharedA = defineSharedConvexQuery({ query, args: {} })
    const useSharedB = defineSharedConvexQuery({ query, args: {} })

    const { result, wrapper } = await captureInNuxt(
      () => ({
        first: useSharedA(),
        second: useSharedB(),
      }),
      { convex },
    )

    expect(result.first).toBe(result.second)

    convex.emitQueryResultByPath('users:get-current:shared:auto-key', { id: 'u1' })
    await waitFor(() => result.first.data.value?.id === 'u1')
    expect(result.second.data.value?.id).toBe('u1')

    wrapper.unmount()
  })

  it('auto-derived keys are isolated for different queries', async () => {
    const queryA = mockFnRef<'query'>('users:get-current:shared:auto-iso-a')
    const queryB = mockFnRef<'query'>('users:get-current:shared:auto-iso-b')

    const useSharedA = defineSharedConvexQuery({ query: queryA, args: {} })
    const useSharedB = defineSharedConvexQuery({ query: queryB, args: {} })

    const { result } = await captureInNuxt(
      () => ({
        first: useSharedA(),
        second: useSharedB(),
      }),
      { convex: new MockConvexClient() },
    )

    expect(result.first).not.toBe(result.second)
  })

  it('throws when same key and query use different static args', async () => {
    const query = mockFnRef<'query'>('users:get-current:shared:args-collision')

    const useSharedA = defineSharedConvexQuery({
      key: 'current-user:args-collision',
      query,
      args: { a: 1 },
    })
    const useSharedB = defineSharedConvexQuery({
      key: 'current-user:args-collision',
      query,
      args: { a: 2 },
    })

    await expect(
      captureInNuxt(
        () => {
          void useSharedA()
          void useSharedB()
          return null
        },
        { convex: new MockConvexClient() },
      ),
    ).rejects.toThrow(/duplicate key/i)
  })
})
