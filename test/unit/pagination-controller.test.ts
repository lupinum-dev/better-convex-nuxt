import type { FunctionReference, PaginationResult } from 'convex/server'
import { describe, expect, it } from 'vitest'

import type { ConvexCallError } from '../../packages/vue/src/errors'
import { createPaginationController } from '../../packages/vue/src/internal/pagination-controller'
import type { PaginationPageOptions } from '../../packages/vue/src/internal/pagination-state'
import type { QueryIsolationTag } from '../../packages/vue/src/internal/query-controller'
import { mockFnRef } from '../helpers/mock-convex-client'

interface Row {
  id: string
}

function page(ids: string[], continueCursor: string, isDone = false): PaginationResult<Row> {
  return { page: ids.map((id) => ({ id })), continueCursor, isDone }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function makeHarness(options?: { live?: boolean }) {
  const query = mockFnRef<'query'>('notes:list')
  let args: Record<string, unknown> | 'skip' = { owner: 'alice' }
  let argsHash = 'alice'
  let boundaryKey = 'notes:list:alice'
  let tag: QueryIsolationTag = {
    identityKey: 'user:alice',
    identityGeneration: 1,
  }
  let live = options?.live ?? true
  let idle = false
  let boundaryFirstPage: PaginationResult<Row> | null = null
  let boundaryPending = false
  let boundaryError: ConvexCallError | null = null
  let boundaryRefreshes = 0
  const fetches: PaginationPageOptions[] = []
  const fetchQueue: Array<Promise<PaginationResult<Row> | null>> = []
  const subscriptions: Array<{
    args: Record<string, unknown>
    active: boolean
    value(value: PaginationResult<Row>): void
    error(error: Error): void
  }> = []

  const client = {
    onUpdate(
      _query: FunctionReference<'query'>,
      subscriptionArgs: Record<string, unknown>,
      onValue: (value: unknown) => void,
      onError?: (error: Error) => void,
    ) {
      const subscription = {
        args: subscriptionArgs,
        active: true,
        value: (value: PaginationResult<Row>) => onValue(value),
        error: (error: Error) => onError?.(error),
      }
      subscriptions.push(subscription)
      return () => {
        subscription.active = false
      }
    },
  }

  const controller = createPaginationController<Row>({
    query,
    initialNumItems: 2,
    subscribe: true,
    keepPreviousData: true,
    getArgs: () => args,
    getArgsHash: () => argsHash,
    getBoundaryKey: () => boundaryKey,
    getIsolationTag: () => tag,
    isIdle: () => idle,
    isLive: () => live,
    isBoundaryPending: () => boundaryPending,
    getBoundaryFirstPage: () => boundaryFirstPage,
    getBoundaryError: () => boundaryError,
    setBoundaryError: (error) => {
      boundaryError = error
    },
    getClient: () => (live ? client : null),
    fetchPage: async (paginationOptions) => {
      fetches.push(paginationOptions)
      return (await fetchQueue.shift()) ?? null
    },
    refreshBoundary: async () => {
      boundaryRefreshes += 1
    },
  })
  controller.start()

  return {
    controller,
    state: {
      query,
      subscriptions,
      fetches,
      fetchQueue,
      get boundaryError() {
        return boundaryError
      },
      get boundaryRefreshes() {
        return boundaryRefreshes
      },
      setBoundaryFirstPage(value: PaginationResult<Row> | null) {
        boundaryFirstPage = value
      },
      setBoundaryPending(value: boolean) {
        boundaryPending = value
      },
      setLive(value: boolean) {
        live = value
      },
      setIdle(value: boolean) {
        idle = value
      },
      setArgs(nextArgs: Record<string, unknown> | 'skip', hash: string, key: string) {
        args = nextArgs
        argsHash = hash
        boundaryKey = key
      },
      setIdentity(nextTag: QueryIsolationTag, key: string) {
        tag = nextTag
        boundaryKey = key
      },
    },
  }
}

describe('pagination controller', () => {
  it('continues through an empty page and binds each live tail callback to its own page', () => {
    const { controller, state } = makeHarness()

    controller.subscribeFirstPage()
    state.subscriptions[0]?.value(page([], 'cursor-1'))
    expect(controller.status.value).toBe('ready')

    controller.loadMore(2)
    controller.loadMore(2)
    expect(state.subscriptions).toHaveLength(2)
    state.subscriptions[1]?.value(page(['b'], 'cursor-2'))
    controller.loadMore(2)
    state.subscriptions[2]?.value(page(['c'], '', true))

    expect(controller.results.value.map((row) => row.id)).toEqual(['b', 'c'])
    expect(controller.pages.value.map((entry) => entry.result?.page[0]?.id)).toEqual(['b', 'c'])
    expect(controller.status.value).toBe('exhausted')
  })

  it('refreshes every loaded page from the new cursor chain and commits atomically', async () => {
    const { controller, state } = makeHarness()
    controller.subscribeFirstPage()
    state.subscriptions[0]?.value(page(['a'], 'old-1'))
    controller.loadMore(2)
    state.subscriptions[1]?.value(page(['b'], 'old-2'))
    controller.loadMore(2)
    state.subscriptions[2]?.value(page(['c'], '', true))

    state.fetchQueue.push(
      Promise.resolve(page(['a2'], 'new-1')),
      Promise.resolve(page(['b2'], 'new-2')),
      Promise.resolve(page(['c2'], '', true)),
    )
    await controller.refresh()

    expect(state.fetches.map((options) => options.cursor)).toEqual([null, 'new-1', 'new-2'])
    expect(controller.results.value.map((row) => row.id)).toEqual(['a2', 'b2', 'c2'])
  })

  it('retires a loaded tail when refresh makes an earlier page terminal', async () => {
    const { controller, state } = makeHarness()
    controller.subscribeFirstPage()
    state.subscriptions[0]?.value(page(['a'], 'old-1'))
    controller.loadMore(2)
    state.subscriptions[1]?.value(page(['b'], '', true))

    state.fetchQueue.push(Promise.resolve(page(['a2'], '', true)))
    await controller.refresh()

    expect(state.fetches.map((options) => options.cursor)).toEqual([null])
    expect(controller.results.value.map((row) => row.id)).toEqual(['a2'])
    expect(controller.pages.value).toEqual([])
    expect(state.subscriptions[1]?.active).toBe(false)
    expect(controller.status.value).toBe('exhausted')
  })

  it('retires only the tail invalidated by a live cursor-boundary change', () => {
    const { controller, state } = makeHarness()
    controller.subscribeFirstPage()
    state.subscriptions[0]?.value(page(['a'], 'cursor-1'))
    controller.loadMore(2)
    state.subscriptions[1]?.value(page(['b'], 'cursor-2'))
    controller.loadMore(2)
    state.subscriptions[2]?.value(page(['c'], '', true))

    state.subscriptions[1]?.value(page(['b2'], 'changed-tail'))
    expect(controller.results.value.map((row) => row.id)).toEqual(['a', 'b2'])
    expect(state.subscriptions[2]?.active).toBe(false)

    state.subscriptions[0]?.value(page(['a2'], 'changed-first'))
    expect(controller.results.value.map((row) => row.id)).toEqual(['a2'])
    expect(state.subscriptions[1]?.active).toBe(false)
    expect(controller.hasNextPage.value).toBe(true)
  })

  it('retires subscriptions and queued refresh results synchronously at an identity boundary', async () => {
    const { controller, state } = makeHarness()
    controller.subscribeFirstPage()
    state.subscriptions[0]?.value(page(['alice'], 'cursor-1'))
    controller.loadMore(2)
    state.subscriptions[1]?.value(page(['tail'], '', true))

    const pending = deferred<PaginationResult<Row> | null>()
    state.fetchQueue.push(pending.promise)
    const refresh = controller.refresh()
    const previousTag = {
      identityKey: 'user:alice',
      identityGeneration: 1,
    } as const
    const nextTag = { identityKey: 'user:bob', identityGeneration: 2 } as const
    state.setIdentity(nextTag, 'notes:list:bob')
    controller.handleIdentityBoundary({
      nextTag,
      previousTag,
      previousBoundaryKey: 'notes:list:alice',
    })

    expect(controller.results.value).toEqual([])
    expect(state.subscriptions.every((subscription) => !subscription.active)).toBe(true)
    pending.resolve(page(['stale-alice'], '', true))
    await refresh
    expect(controller.results.value).toEqual([])
  })

  it('disposes exactly once and rejects callbacks from retired subscriptions', () => {
    const { controller, state } = makeHarness()
    controller.subscribeFirstPage()
    const subscription = state.subscriptions[0]
    controller.dispose()
    controller.dispose()
    subscription?.value(page(['late'], '', true))

    expect(subscription?.active).toBe(false)
    expect(controller.results.value).toEqual([])
  })
})
