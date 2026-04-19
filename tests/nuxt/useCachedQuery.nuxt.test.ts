import { describe, expect, it, vi } from 'vitest'

import { useCachedQuery } from '../../src/runtime/convex/composables/useCachedQuery'
import { getQueryKey } from '../../src/runtime/convex/shared/convex-cache'
import { MockConvexClient, mockFnRef } from '../support/nuxt/mock-convex-client'
import { captureInNuxt } from '../support/nuxt/runtime-harness'
import { waitFor } from '../support/nuxt/wait-for'

describe('useCachedQuery (Nuxt runtime)', () => {
  it('seeds from matching cached list data and reports matched cache status', async () => {
    const convex = new MockConvexClient()
    const detailQuery = mockFnRef<'query'>('tasks:get')
    const listQuery = mockFnRef<'query'>('tasks:list')
    const listArgs = {}
    const detailArgs = { id: 'task-1' }
    const cacheKey = getQueryKey(listQuery, listArgs)

    const { result } = await captureInNuxt(
      () =>
        useCachedQuery(detailQuery, detailArgs as never, {
          from: {
            query: listQuery,
            args: listArgs,
            find: (tasks) => tasks.find((task) => task._id === detailArgs.id),
          },
        }),
      {
        convex,
        payloadData: {
          [cacheKey]: [{ _id: 'task-1', title: 'Cached task' }],
        },
      },
    )

    expect(result.data.value).toEqual({ _id: 'task-1', title: 'Cached task' })
    expect(result.isFromCache.value).toBe(true)
    expect(result.cacheStatus.value).toBe('matched')

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResult(detailQuery, detailArgs, {
      _id: 'task-1',
      title: 'Live task',
      body: 'Loaded from backend',
    })
    await waitFor(() => result.pending.value === false)

    expect(result.isFromCache.value).toBe(false)
    expect(result.cacheStatus.value).toBe('matched')
    expect(result.data.value).toEqual({
      _id: 'task-1',
      title: 'Live task',
      body: 'Loaded from backend',
    })
  })

  it('warns when cached source data exists but find() misses the current detail args', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const convex = new MockConvexClient()
      const detailQuery = mockFnRef<'query'>('tasks:get:mismatch')
      const listQuery = mockFnRef<'query'>('tasks:list:mismatch')
      const listArgs = {}
      const detailArgs = { id: 'task-2' }
      const cacheKey = getQueryKey(listQuery, listArgs)

      const { result } = await captureInNuxt(
        () =>
          useCachedQuery(detailQuery, detailArgs as never, {
            from: {
              query: listQuery,
              args: listArgs,
              find: (tasks) => tasks.find((task) => task._id === detailArgs.id),
            },
          }),
        {
          convex,
          payloadData: {
            [cacheKey]: [{ _id: 'task-1', title: 'Cached task' }],
          },
        },
      )

      expect(result.cacheStatus.value).toBe('match-missing')
      expect(result.isFromCache.value).toBe(false)
      await waitFor(() => warnSpy.mock.calls.length > 0)

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('found cached source data'),
        expect.objectContaining({
          query: 'tasks:get:mismatch',
          sourceQuery: 'tasks:list:mismatch',
          sourceArgs: {},
        }),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})
