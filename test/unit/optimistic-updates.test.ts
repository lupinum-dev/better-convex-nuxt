import type { FunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  updateQuery,
  setQueryData,
  updateAllQueries,
  deleteFromQuery,
  insertAtTop,
  insertAtPosition,
  insertAtBottomIfLoaded,
  optimisticallyUpdateValueInPaginatedQuery,
  deleteFromPaginatedQuery,
} from '../../src/runtime/composables/optimistic-updates'
import { mockFnRef } from '../helpers/mock-convex-client'

interface StoredQuery {
  query: unknown
  args: Record<string, unknown>
  value: unknown
}

class FakeOptimisticLocalStore {
  private entries = new Map<string, StoredQuery>()

  getQuery(query: unknown, args: unknown): unknown {
    return this.entries.get(this.keyFor(query, args))?.value
  }

  setQuery(query: unknown, args: unknown, value: unknown): void {
    this.entries.set(this.keyFor(query, args), {
      query,
      args: (args ?? {}) as Record<string, unknown>,
      value,
    })
  }

  getAllQueries(query: unknown): Array<{ args: Record<string, unknown>, value: unknown }> {
    const path = this.pathFor(query)
    return [...this.entries.values()]
      .filter(entry => this.pathFor(entry.query) === path)
      .map(entry => ({ args: entry.args, value: entry.value }))
  }

  private keyFor(query: unknown, args: unknown): string {
    return `${this.pathFor(query)}::${JSON.stringify(args ?? {})}`
  }

  private pathFor(query: unknown): string {
    if (!query || typeof query !== 'object') {
      return String(query)
    }

    const record = query as Record<string | symbol, unknown>
    return String(record[Symbol.for('functionName')] ?? record._path ?? record.functionPath ?? 'unknown')
  }
}

describe('optimistic-updates helpers', () => {
  it('updateQuery computes next value from current value', () => {
    const localStore = new FakeOptimisticLocalStore()
    const query = mockFnRef<'query'>('notes:list')

    updateQuery({
      query,
      args: { orgId: 'org-1' },
      localQueryStore: localStore as never,
      updater: current => [
        ...(current ?? []),
        { _id: 'n1', title: 'First' },
      ],
    })

    expect(localStore.getQuery(query, { orgId: 'org-1' })).toEqual([
      { _id: 'n1', title: 'First' },
    ])
  })

  it('setQueryData writes value directly', () => {
    const localStore = new FakeOptimisticLocalStore()
    const query = mockFnRef<'query'>('notes:get')

    setQueryData({
      query,
      args: { id: 'n1' },
      localQueryStore: localStore as never,
      value: { _id: 'n1', title: 'Stored' },
    })

    expect(localStore.getQuery(query, { id: 'n1' })).toEqual({ _id: 'n1', title: 'Stored' })
  })

  it('updateAllQueries updates only matching args and skips undefined updater results', () => {
    const localStore = new FakeOptimisticLocalStore()
    const query = mockFnRef<'query'>('notes:listByOrg')

    localStore.setQuery(query, { orgId: 'org-1', archived: false }, [{ _id: 'a' }])
    localStore.setQuery(query, { orgId: 'org-1', archived: true }, [{ _id: 'b' }])
    localStore.setQuery(query, { orgId: 'org-2', archived: false }, [{ _id: 'c' }])

    updateAllQueries({
      query,
      argsToMatch: { orgId: 'org-1' },
      localQueryStore: localStore as never,
      updater: (current, args) => {
        if (!current || args.archived === true) {
          return undefined
        }

        return [...current, { _id: 'next' }] as typeof current
      },
    })

    expect(localStore.getQuery(query, { orgId: 'org-1', archived: false })).toEqual([
      { _id: 'a' },
      { _id: 'next' },
    ])
    expect(localStore.getQuery(query, { orgId: 'org-1', archived: true })).toEqual([{ _id: 'b' }])
    expect(localStore.getQuery(query, { orgId: 'org-2', archived: false })).toEqual([{ _id: 'c' }])
  })

  it('deleteFromQuery removes matching items and ignores unloaded values', () => {
    const localStore = new FakeOptimisticLocalStore()
    const query = mockFnRef<'query'>('tasks:list')

    localStore.setQuery(query, { userId: 'u1' }, [
      { _id: 't1', done: false },
      { _id: 't2', done: true },
    ])

    deleteFromQuery({
      query,
      args: { userId: 'u1' },
      localQueryStore: localStore as never,
      shouldDelete: task => task._id === 't2',
    })

    deleteFromQuery({
      query,
      args: { userId: 'missing' },
      localQueryStore: localStore as never,
      shouldDelete: () => true,
    })

    expect(localStore.getQuery(query, { userId: 'u1' })).toEqual([{ _id: 't1', done: false }])
    expect(localStore.getQuery(query, { userId: 'missing' })).toBeUndefined()
  })

  it('insertAtTop prepends new item only for matching paginated args', () => {
    const localStore = new FakeOptimisticLocalStore()
    const query = mockFnRef<'query'>('posts:listPaginated') as FunctionReference<'query'>

    localStore.setQuery(
      query,
      { orgId: 'org-1', paginationOpts: { numItems: 10, cursor: null } },
      { page: [{ _id: 'p1' }], isDone: false, continueCursor: 'c1' },
    )
    localStore.setQuery(
      query,
      { orgId: 'org-2', paginationOpts: { numItems: 10, cursor: null } },
      { page: [{ _id: 'p2' }], isDone: false, continueCursor: 'c1' },
    )

    insertAtTop({
      paginatedQuery: query as never,
      argsToMatch: { orgId: 'org-1' },
      localQueryStore: localStore as never,
      item: { _id: 'new-top' } as never,
    })

    const updatedOrg1 = localStore.getQuery(query, {
      orgId: 'org-1',
      paginationOpts: { numItems: 10, cursor: null },
    }) as { page: Array<{ _id: string }> }

    const untouchedOrg2 = localStore.getQuery(query, {
      orgId: 'org-2',
      paginationOpts: { numItems: 10, cursor: null },
    }) as { page: Array<{ _id: string }> }

    expect(updatedOrg1.page.map(item => item._id)).toEqual(['new-top', 'p1'])
    expect(untouchedOrg2.page.map(item => item._id)).toEqual(['p2'])
  })

  it('insertAtPosition respects multi-key sort ordering', () => {
    const localStore = new FakeOptimisticLocalStore()
    const query = mockFnRef<'query'>('tasks:listPaginated') as FunctionReference<'query'>

    localStore.setQuery(
      query,
      { status: 'open', paginationOpts: { numItems: 10, cursor: null } },
      {
        page: [
          { _id: 'a', priority: 3, order: 10 },
          { _id: 'b', priority: 2, order: 20 },
          { _id: 'c', priority: 1, order: 30 },
        ],
        isDone: true,
        continueCursor: null,
      },
    )

    insertAtPosition({
      paginatedQuery: query as never,
      sortOrder: 'desc',
      sortKeyFromItem: item => [item.priority, item.order],
      localQueryStore: localStore as never,
      item: { _id: 'mid', priority: 2, order: 25 } as never,
    })

    const updated = localStore.getQuery(query, {
      status: 'open',
      paginationOpts: { numItems: 10, cursor: null },
    }) as { page: Array<{ _id: string }> }

    expect(updated.page.map(item => item._id)).toEqual(['a', 'mid', 'b', 'c'])
  })

  it('insertAtBottomIfLoaded only appends when result is fully loaded', () => {
    const localStore = new FakeOptimisticLocalStore()
    const query = mockFnRef<'query'>('messages:listPaginated') as FunctionReference<'query'>

    localStore.setQuery(
      query,
      { channel: 'general', paginationOpts: { numItems: 5, cursor: null } },
      { page: [{ _id: 'm1' }], isDone: false, continueCursor: 'c1' },
    )

    insertAtBottomIfLoaded({
      paginatedQuery: query as never,
      localQueryStore: localStore as never,
      item: { _id: 'm2' } as never,
    })

    const notDone = localStore.getQuery(query, {
      channel: 'general',
      paginationOpts: { numItems: 5, cursor: null },
    }) as { page: Array<{ _id: string }>, isDone: boolean }
    expect(notDone.page.map(item => item._id)).toEqual(['m1'])

    localStore.setQuery(
      query,
      { channel: 'general', paginationOpts: { numItems: 5, cursor: null } },
      { page: [{ _id: 'm1' }], isDone: true, continueCursor: null },
    )

    insertAtBottomIfLoaded({
      paginatedQuery: query as never,
      localQueryStore: localStore as never,
      item: { _id: 'm2' } as never,
    })

    const done = localStore.getQuery(query, {
      channel: 'general',
      paginationOpts: { numItems: 5, cursor: null },
    }) as { page: Array<{ _id: string }>, isDone: boolean }
    expect(done.page.map(item => item._id)).toEqual(['m1', 'm2'])
  })

  it('optimisticallyUpdateValueInPaginatedQuery updates matching values in-place', () => {
    const localStore = new FakeOptimisticLocalStore()
    const query = mockFnRef<'query'>('todos:listPaginated') as FunctionReference<'query'>

    localStore.setQuery(
      query,
      { listId: 'inbox', paginationOpts: { numItems: 5, cursor: null } },
      {
        page: [
          { _id: 't1', done: false },
          { _id: 't2', done: false },
        ],
        isDone: true,
        continueCursor: null,
      },
    )

    optimisticallyUpdateValueInPaginatedQuery({
      paginatedQuery: query as never,
      argsToMatch: { listId: 'inbox' },
      localQueryStore: localStore as never,
      updateValue: item => item._id === 't2' ? { ...item, done: true } as never : item,
    })

    const updated = localStore.getQuery(query, {
      listId: 'inbox',
      paginationOpts: { numItems: 5, cursor: null },
    }) as { page: Array<{ _id: string, done: boolean }> }

    expect(updated.page).toEqual([
      { _id: 't1', done: false },
      { _id: 't2', done: true },
    ])
  })

  it('deleteFromPaginatedQuery removes matching items across loaded pages', () => {
    const localStore = new FakeOptimisticLocalStore()
    const query = mockFnRef<'query'>('comments:listPaginated') as FunctionReference<'query'>

    localStore.setQuery(
      query,
      { postId: 'p1', paginationOpts: { numItems: 5, cursor: null } },
      {
        page: [
          { _id: 'c1', spam: false },
          { _id: 'c2', spam: true },
          { _id: 'c3', spam: false },
        ],
        isDone: true,
        continueCursor: null,
      },
    )

    deleteFromPaginatedQuery({
      paginatedQuery: query as never,
      localQueryStore: localStore as never,
      shouldDelete: comment => comment.spam,
    })

    const updated = localStore.getQuery(query, {
      postId: 'p1',
      paginationOpts: { numItems: 5, cursor: null },
    }) as { page: Array<{ _id: string }> }

    expect(updated.page.map(item => item._id)).toEqual(['c1', 'c3'])
  })
})
