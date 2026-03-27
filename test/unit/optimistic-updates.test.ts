import { describe, expect, it } from 'vitest'

import { createOptimisticContext } from '../../src/runtime/composables/optimistic-updates'
import { mockFnRef } from '../helpers/mock-convex-client'
import type { FunctionReference } from 'convex/server'

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

  getAllQueries(query: unknown): Array<{ args: Record<string, unknown>; value: unknown }> {
    const path = this.pathFor(query)
    return [...this.entries.values()]
      .filter((entry) => this.pathFor(entry.query) === path)
      .map((entry) => ({ args: entry.args, value: entry.value }))
  }

  private keyFor(query: unknown, args: unknown): string {
    return `${this.pathFor(query)}::${JSON.stringify(args ?? {})}`
  }

  private pathFor(query: unknown): string {
    if (!query || typeof query !== 'object') {
      return String(query)
    }

    const record = query as Record<string | symbol, unknown>
    return String(
      record[Symbol.for('functionName')] ?? record._path ?? record.functionPath ?? 'unknown',
    )
  }
}

describe('optimistic-updates fluent API', () => {
  describe('ctx.query()', () => {
    it('update() computes next value from current value', () => {
      const store = new FakeOptimisticLocalStore()
      const query = mockFnRef<'query'>('notes:list')
      const ctx = createOptimisticContext(store as never)

      ctx.query(query, { orgId: 'org-1' }).update((current) =>
        [...(current ?? []), { _id: 'n1', title: 'First' }],
      )

      expect(store.getQuery(query, { orgId: 'org-1' })).toEqual([{ _id: 'n1', title: 'First' }])
    })

    it('set() writes value directly', () => {
      const store = new FakeOptimisticLocalStore()
      const query = mockFnRef<'query'>('notes:get')
      const ctx = createOptimisticContext(store as never)

      ctx.query(query, { id: 'n1' }).set({ _id: 'n1', title: 'Stored' })

      expect(store.getQuery(query, { id: 'n1' })).toEqual({ _id: 'n1', title: 'Stored' })
    })
  })

  describe('ctx.paginatedQuery()', () => {
    it('insertAtTop() prepends new item for matching paginated args', () => {
      const store = new FakeOptimisticLocalStore()
      const query = mockFnRef<'query'>('posts:listPaginated') as FunctionReference<'query'>
      const ctx = createOptimisticContext(store as never)

      store.setQuery(
        query,
        { orgId: 'org-1', paginationOpts: { numItems: 10, cursor: null } },
        { page: [{ _id: 'p1' }], isDone: false, continueCursor: 'c1' },
      )
      store.setQuery(
        query,
        { orgId: 'org-2', paginationOpts: { numItems: 10, cursor: null } },
        { page: [{ _id: 'p2' }], isDone: false, continueCursor: 'c1' },
      )

      ctx.paginatedQuery(query as never, { orgId: 'org-1' } as never)
        .insertAtTop({ _id: 'new-top' } as never)

      const updatedOrg1 = store.getQuery(query, {
        orgId: 'org-1',
        paginationOpts: { numItems: 10, cursor: null },
      }) as { page: Array<{ _id: string }> }

      const untouchedOrg2 = store.getQuery(query, {
        orgId: 'org-2',
        paginationOpts: { numItems: 10, cursor: null },
      }) as { page: Array<{ _id: string }> }

      expect(updatedOrg1.page.map((item) => item._id)).toEqual(['new-top', 'p1'])
      expect(untouchedOrg2.page.map((item) => item._id)).toEqual(['p2'])
    })

    it('insertAtPosition() inserts at a specific numeric index', () => {
      const store = new FakeOptimisticLocalStore()
      const query = mockFnRef<'query'>('tasks:listPaginated') as FunctionReference<'query'>
      const ctx = createOptimisticContext(store as never)

      store.setQuery(
        query,
        { status: 'open', paginationOpts: { numItems: 10, cursor: null } },
        {
          page: [
            { _id: 'a', order: 1 },
            { _id: 'c', order: 3 },
          ],
          isDone: true,
          continueCursor: null,
        },
      )

      ctx.paginatedQuery(query as never, { status: 'open' } as never)
        .insertAtPosition({ _id: 'b', order: 2 } as never, 1)

      const updated = store.getQuery(query, {
        status: 'open',
        paginationOpts: { numItems: 10, cursor: null },
      }) as { page: Array<{ _id: string }> }

      expect(updated.page.map((item) => item._id)).toEqual(['a', 'b', 'c'])
    })

    it('insertAtBottomIfLoaded() only appends when isDone is true', () => {
      const store = new FakeOptimisticLocalStore()
      const query = mockFnRef<'query'>('messages:listPaginated') as FunctionReference<'query'>
      const ctx = createOptimisticContext(store as never)

      store.setQuery(
        query,
        { channel: 'general', paginationOpts: { numItems: 5, cursor: null } },
        { page: [{ _id: 'm1' }], isDone: false, continueCursor: 'c1' },
      )

      ctx.paginatedQuery(query as never, { channel: 'general' } as never)
        .insertAtBottomIfLoaded({ _id: 'm2' } as never)

      const notDone = store.getQuery(query, {
        channel: 'general',
        paginationOpts: { numItems: 5, cursor: null },
      }) as { page: Array<{ _id: string }> }
      expect(notDone.page.map((item) => item._id)).toEqual(['m1'])

      store.setQuery(
        query,
        { channel: 'general', paginationOpts: { numItems: 5, cursor: null } },
        { page: [{ _id: 'm1' }], isDone: true, continueCursor: null },
      )

      ctx.paginatedQuery(query as never, { channel: 'general' } as never)
        .insertAtBottomIfLoaded({ _id: 'm2' } as never)

      const done = store.getQuery(query, {
        channel: 'general',
        paginationOpts: { numItems: 5, cursor: null },
      }) as { page: Array<{ _id: string }> }
      expect(done.page.map((item) => item._id)).toEqual(['m1', 'm2'])
    })

    it('updateItem() updates matching item by _id', () => {
      const store = new FakeOptimisticLocalStore()
      const query = mockFnRef<'query'>('todos:listPaginated') as FunctionReference<'query'>
      const ctx = createOptimisticContext(store as never)

      store.setQuery(
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

      ctx.paginatedQuery(query as never, { listId: 'inbox' } as never)
        .updateItem('t2', (item: any) => ({ ...item, done: true }))

      const updated = store.getQuery(query, {
        listId: 'inbox',
        paginationOpts: { numItems: 5, cursor: null },
      }) as { page: Array<{ _id: string; done: boolean }> }

      expect(updated.page).toEqual([
        { _id: 't1', done: false },
        { _id: 't2', done: true },
      ])
    })

    it('deleteItem() removes matching item by _id', () => {
      const store = new FakeOptimisticLocalStore()
      const query = mockFnRef<'query'>('comments:listPaginated') as FunctionReference<'query'>
      const ctx = createOptimisticContext(store as never)

      store.setQuery(
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

      ctx.paginatedQuery(query as never, { postId: 'p1' } as never)
        .deleteItem('c2')

      const updated = store.getQuery(query, {
        postId: 'p1',
        paginationOpts: { numItems: 5, cursor: null },
      }) as { page: Array<{ _id: string }> }

      expect(updated.page.map((item) => item._id)).toEqual(['c1', 'c3'])
    })
  })

  it('exposes store for escape hatch', () => {
    const store = new FakeOptimisticLocalStore()
    const ctx = createOptimisticContext(store as never)
    expect(ctx.store).toBe(store)
  })
})
