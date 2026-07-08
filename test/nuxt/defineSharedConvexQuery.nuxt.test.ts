import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import { useState } from '#imports'

import { defineSharedConvexQuery } from '../../src/runtime/composables/defineSharedConvexQuery'
import type { UseConvexQueryData } from '../../src/runtime/composables/useConvexQuery'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

// The shared query defaults to auth:'auto'; module auth is enabled by default in
// the harness, so a subscription is only acquired for an authenticated session.
function signIn(): void {
  useState<boolean>('convex:pending', () => false)
  useState<string | null>('convex:token', () => 'signed.in.jwt')
}

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
        signIn()
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

  it('shared subscription survives the first consumer unmounting (F-4)', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('users:get-current:shared-lifetime')

    const useSharedUser = defineSharedConvexQuery<
      typeof query,
      Record<string, never>,
      { id: string }
    >({
      key: 'current-user:lifetime',
      query,
      args: {},
    })

    const showA = ref(true)
    const captured: { b: UseConvexQueryData<{ id: string }> | null } = { b: null }

    // Child A is the FIRST consumer; pre-fix it owns the shared query's effect
    // scope, so unmounting A used to tear down the subscription B still relies on.
    const ChildA = defineComponent({
      setup() {
        useSharedUser()
        return () => h('div', 'a')
      },
    })
    const ChildB = defineComponent({
      setup() {
        captured.b = useSharedUser()
        return () => h('div', 'b')
      },
    })

    // Wire this test's mock client + signed-in state into the shared nuxt app
    // (the env reuses one app across mounts; captureInNuxt owns the swappable
    // $convex proxy target). Then mount the parent/children in that same app.
    await captureInNuxt(
      () => {
        useState<boolean>('convex:pending', () => false).value = false
        useState<string | null>('convex:token', () => 'signed.in.jwt').value = 'signed.in.jwt'
        return null
      },
      { convex, convexConfig: { auth: { enabled: true }, defaults: { auth: 'auto' } } },
    )

    await mountSuspended(
      defineComponent({
        setup() {
          return () => [showA.value ? h(ChildA) : null, h(ChildB)]
        },
      }),
    )

    await waitFor(() => convex.activeListenerCount(query, {}) === 1)
    convex.emitQueryResultByPath('users:get-current:shared-lifetime', { id: 'u1' })
    await waitFor(() => captured.b?.data.value?.id === 'u1')

    // Unmount the first consumer.
    showA.value = false
    await nextTick()
    await nextTick()

    // The detached registry-owned scope keeps the subscription alive; B still updates.
    expect(convex.activeListenerCount(query, {})).toBe(1)
    convex.emitQueryResultByPath('users:get-current:shared-lifetime', { id: 'u2' })
    await waitFor(() => captured.b?.data.value?.id === 'u2')
    expect(captured.b?.data.value?.id).toBe('u2')
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
