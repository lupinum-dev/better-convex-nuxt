import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { describe, expect, it } from 'vitest'
import type { MaybeRefOrGetter } from 'vue'

import { createConvexQueryState } from '../../src/runtime/composables/useConvexQuery'
import { useConvexMutation } from '../../src/runtime/composables/useConvexMutation'
import { setDevtoolsStore } from '../../src/runtime/devtools/runtime'
import { ConvexDevtoolsStore } from '../../src/runtime/devtools/store'
import { MockConvexClient, mockFnRef } from '../support/nuxt/mock-convex-client'
import { captureInNuxt } from '../support/nuxt/runtime-harness'
import { waitFor } from '../support/nuxt/wait-for'

function useConvexQueryState<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
) {
  return createConvexQueryState<Query, Args, DataT>(query, args, undefined, true).resultData
}

describe('devtools instrumentation (Nuxt runtime)', () => {
  it('captures first-render queries in the devtools snapshot', async () => {
    const convex = new MockConvexClient()
    const query = mockFnRef<'query'>('notes:list:devtools')
    const store = new ConvexDevtoolsStore()
    setDevtoolsStore(store)

    await captureInNuxt(() => useConvexQueryState(query, {}), { convex })
    await waitFor(() => convex.calls.onUpdate.length > 0)

    expect(store.getSnapshot().queries).toEqual([
      expect.objectContaining({
        name: 'notes:list:devtools',
        status: 'pending',
        dataSource: 'websocket',
        hasSubscription: true,
        args: {},
      }),
    ])

    convex.emitQueryResult(query, {}, [{ _id: 'n1', title: 'Tracked' }])

    await waitFor(() => store.getSnapshot().queries[0]?.status === 'success')

    expect(store.getSnapshot().queries[0]).toEqual(
      expect.objectContaining({
        name: 'notes:list:devtools',
        status: 'success',
        data: [{ _id: 'n1', title: 'Tracked' }],
        updateCount: 1,
      }),
    )
  })

  it('captures mutation lifecycle entries in the devtools snapshot', async () => {
    const convex = new MockConvexClient()
    const mutation = mockFnRef<'mutation'>('notes:create:devtools')
    const store = new ConvexDevtoolsStore()
    setDevtoolsStore(store)

    let resolveMutation: ((value: { ok: true; title: string }) => void) | null = null
    convex.setMutationHandler('notes:create:devtools', async (_args) => {
      return await new Promise<{ ok: true; title: string }>((resolve) => {
        resolveMutation = resolve
      })
    })

    const { result } = await captureInNuxt(() => useConvexMutation(mutation), { convex })

    const execution = result({ title: 'Ship it' } as never)

    await waitFor(() => store.getSnapshot().mutations.length === 1)

    expect(store.getSnapshot().mutations[0]).toEqual(
      expect.objectContaining({
        name: 'notes:create:devtools',
        type: 'mutation',
        state: 'pending',
        args: { title: 'Ship it' },
      }),
    )

    resolveMutation?.({ ok: true, title: 'Ship it' })
    await execution
    await waitFor(() => store.getSnapshot().mutations[0]?.state === 'success')

    expect(store.getSnapshot().mutations[0]).toEqual(
      expect.objectContaining({
        name: 'notes:create:devtools',
        state: 'success',
        result: { ok: true, title: 'Ship it' },
      }),
    )
  })
})
