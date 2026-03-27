/**
 * Optimistic update helpers for Convex mutations.
 *
 * Provides a fluent builder API (`ctx.query()`, `ctx.paginatedQuery()`) for
 * performing optimistic updates on local query results while mutations are in flight.
 */

import type { OptimisticLocalStore } from 'convex/browser'
import type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
  PaginationResult,
  PaginationOptions,
} from 'convex/server'

import { argsMatch as sharedArgsMatch } from '../utils/shared-helpers'

// ============================================================================
// Types for Paginated Queries
// ============================================================================

/**
 * A FunctionReference that is usable with paginated query optimistic updates.
 *
 * This function reference must:
 * - Refer to a public query
 * - Have an argument named "paginationOpts" of type PaginationOptions
 * - Have a return type of PaginationResult.
 */
export type PaginatedQueryReference = FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PaginationResult<any>
>

/**
 * Given a PaginatedQueryReference, get the type of the arguments
 * object for the query, excluding the `paginationOpts` argument.
 */
export type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Omit<
  FunctionArgs<Query>,
  'paginationOpts'
>

/**
 * Given a PaginatedQueryReference, get the type of the item being paginated over.
 */
export type PaginatedQueryItem<Query extends PaginatedQueryReference> =
  FunctionReturnType<Query>['page'][number]

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Check if query args match the filter args for paginated queries.
 * Uses shared deep equality, skips paginationOpts.
 * @internal
 */
function argsMatchForPaginatedQuery(
  queryArgs: Record<string, unknown>,
  filterArgs: Record<string, unknown>,
): boolean {
  return sharedArgsMatch(queryArgs, filterArgs, ['paginationOpts'])
}

// ============================================================================
// OptimisticContext — fluent builder API for optimistic updates
// ============================================================================

/**
 * Handle for performing optimistic updates on a regular (non-paginated) query.
 * Obtained via `ctx.query(api.x, args)` inside an `optimisticUpdate` callback.
 */
export interface OptimisticQueryHandle<Query extends FunctionReference<'query'>> {
  /**
   * Update the query result using an updater function.
   * @example ctx.query(api.notes.list, {}).update(notes => [...notes, newNote])
   */
  update: (updater: (current: FunctionReturnType<Query> | undefined) => FunctionReturnType<Query>) => void
  /**
   * Replace the query result with a new value.
   * @example ctx.query(api.notes.get, { id }).set({ ...note, title: 'Updated' })
   */
  set: (value: FunctionReturnType<Query>) => void
}

/**
 * Handle for performing optimistic updates on a paginated query.
 * Obtained via `ctx.paginatedQuery(api.x, args)` inside an `optimisticUpdate` callback.
 * Applies the operation across all currently loaded pages for the given query + args.
 */
export interface OptimisticPaginatedHandle<Query extends PaginatedQueryReference> {
  /** Insert an item at the top of the first page. */
  insertAtTop: (item: PaginatedQueryItem<Query>) => void
  /** Insert an item at a specific numeric index across the page. */
  insertAtPosition: (item: PaginatedQueryItem<Query>, position: number) => void
  /** Insert an item at the bottom of the last loaded page (only if all pages are loaded). */
  insertAtBottomIfLoaded: (item: PaginatedQueryItem<Query>) => void
  /**
   * Update the item matching the given Convex document `_id`.
   * All Convex documents have a system-generated `_id` field — this is the standard matching key.
   */
  updateItem: (id: string, updater: (item: PaginatedQueryItem<Query>) => PaginatedQueryItem<Query>) => void
  /**
   * Remove the item matching the given Convex document `_id`.
   * All Convex documents have a system-generated `_id` field — this is the standard matching key.
   */
  deleteItem: (id: string) => void
}

export interface OptimisticMatchedQueryHandle<Query extends FunctionReference<'query'>> {
  update: (
    updater: (
      current: FunctionReturnType<Query> | undefined,
      args: FunctionArgs<Query>,
    ) => FunctionReturnType<Query>,
  ) => void
}

export interface OptimisticMatchedPaginatedHandle<Query extends PaginatedQueryReference> {
  update: (
    updater: (
      current: PaginationResult<PaginatedQueryItem<Query>> | undefined,
      args: FunctionArgs<Query>,
    ) => PaginationResult<PaginatedQueryItem<Query>>,
  ) => void
}

/**
 * Typed context passed to the `optimisticUpdate` callback in `useConvexMutation`.
 * Provides a discoverable, fluent API over `OptimisticLocalStore`.
 *
 * @example
 * ```ts
 * const { execute } = useConvexMutation(api.notes.add, {
 *   optimisticUpdate: (ctx, args) => {
 *     // Regular query update
 *     ctx.query(api.notes.list, {}).update(notes => [...notes, { ...args, _id: 'temp' }])
 *
 *     // Paginated query update
 *     ctx.paginatedQuery(api.notes.listPaginated, {}).insertAtTop({ ...args, _id: 'temp' })
 *   }
 * })
 * ```
 */
export interface OptimisticContext {
  /**
   * Get a handle to perform optimistic updates on a regular query.
   */
  query<Q extends FunctionReference<'query'>>(query: Q, args: FunctionArgs<Q>): OptimisticQueryHandle<Q>
  /**
   * Get a handle to perform optimistic updates on a paginated query.
   * Applies to all currently loaded pages matching these args.
   */
  paginatedQuery<Q extends PaginatedQueryReference>(
    query: Q,
    args: PaginatedQueryArgs<Q>,
  ): OptimisticPaginatedHandle<Q>
  /**
   * Match every active arg combination for this query.
   */
  matchQuery<Q extends FunctionReference<'query'>>(query: Q): OptimisticMatchedQueryHandle<Q>
  /**
   * Match every active paginated page entry for this query.
   */
  matchPaginatedQuery<Q extends PaginatedQueryReference>(
    query: Q,
  ): OptimisticMatchedPaginatedHandle<Q>
  /**
   * Escape hatch: direct access to the underlying Convex OptimisticLocalStore.
   * Use when the builder methods don't cover your use case.
   */
  store: OptimisticLocalStore
}

/**
 * Create an OptimisticContext that wraps a Convex OptimisticLocalStore
 * with a typed, discoverable builder API.
 * @internal
 */
export function createOptimisticContext(store: OptimisticLocalStore): OptimisticContext {
  return {
    store,

    query<Q extends FunctionReference<'query'>>(query: Q, args: FunctionArgs<Q>): OptimisticQueryHandle<Q> {
      return {
        update(updater) {
          const currentValue = store.getQuery(query, args)
          store.setQuery(query, args, updater(currentValue))
        },
        set(value) {
          store.setQuery(query, args, value)
        },
      }
    },

    matchQuery<Q extends FunctionReference<'query'>>(query: Q): OptimisticMatchedQueryHandle<Q> {
      return {
        update(updater) {
          for (const { args, value } of store.getAllQueries(query)) {
            store.setQuery(
              query,
              args as FunctionArgs<Q>,
              updater(value as FunctionReturnType<Q> | undefined, args as FunctionArgs<Q>),
            )
          }
        },
      }
    },

    paginatedQuery<Q extends PaginatedQueryReference>(
      query: Q,
      args: PaginatedQueryArgs<Q>,
    ): OptimisticPaginatedHandle<Q> {
      /** Apply an operation to all matching paginated query entries in the store. */
      function forEachMatchingPage(
        callback: (paginatedValue: PaginationResult<PaginatedQueryItem<Q>>, pageArgs: FunctionArgs<Q>) => void,
      ): void {
        const allQueries = store.getAllQueries(query)
        for (const { args: pageArgs, value } of allQueries) {
          if (!value) continue
          if (!argsMatchForPaginatedQuery(pageArgs as Record<string, unknown>, args as Record<string, unknown>)) continue
          callback(value as PaginationResult<PaginatedQueryItem<Q>>, pageArgs)
        }
      }

      return {
        insertAtTop(item) {
          forEachMatchingPage((paginatedValue, pageArgs) => {
            store.setQuery(query, pageArgs, {
              ...paginatedValue,
              page: [item, ...paginatedValue.page],
            })
          })
        },

        insertAtPosition(item, position) {
          forEachMatchingPage((paginatedValue, pageArgs) => {
            const newPage = [...paginatedValue.page]
            newPage.splice(position, 0, item)
            store.setQuery(query, pageArgs, {
              ...paginatedValue,
              page: newPage,
            })
          })
        },

        insertAtBottomIfLoaded(item) {
          forEachMatchingPage((paginatedValue, pageArgs) => {
            if (!paginatedValue.isDone) return
            store.setQuery(query, pageArgs, {
              ...paginatedValue,
              page: [...paginatedValue.page, item],
            })
          })
        },

        updateItem(id, updater) {
          forEachMatchingPage((paginatedValue, pageArgs) => {
            const newPage = paginatedValue.page.map((item) =>
              (item as { _id?: string })._id === id ? updater(item) : item,
            )
            store.setQuery(query, pageArgs, {
              ...paginatedValue,
              page: newPage,
            })
          })
        },

        deleteItem(id) {
          forEachMatchingPage((paginatedValue, pageArgs) => {
            const newPage = paginatedValue.page.filter(
              (item) => (item as { _id?: string })._id !== id,
            )
            store.setQuery(query, pageArgs, {
              ...paginatedValue,
              page: newPage,
            })
          })
        },
      }
    },

    matchPaginatedQuery<Q extends PaginatedQueryReference>(
      query: Q,
    ): OptimisticMatchedPaginatedHandle<Q> {
      return {
        update(updater) {
          for (const { args, value } of store.getAllQueries(query)) {
            store.setQuery(
              query,
              args as FunctionArgs<Q>,
              updater(
                value as PaginationResult<PaginatedQueryItem<Q>> | undefined,
                args as FunctionArgs<Q>,
              ),
            )
          }
        },
      }
    },
  }
}

// ============================================================================
// Standalone optimistic update helpers
// ============================================================================

/** Infer the array item type from a query that returns an array. */
type ArrayQueryItem<Q extends FunctionReference<'query'>> =
  FunctionReturnType<Q> extends Array<infer T> ? T : never

/**
 * Prepend an item to a query result that returns an array.
 *
 * @example
 * ```ts
 * const addNote = useConvexMutation(api.notes.add, {
 *   optimisticUpdate: (ctx, args) =>
 *     prependTo(ctx, api.notes.list, {}, { ...args, _id: crypto.randomUUID(), _creationTime: Date.now() }),
 * })
 * ```
 */
export function prependTo<Q extends FunctionReference<'query'>>(
  ctx: OptimisticContext,
  query: Q,
  args: FunctionArgs<Q>,
  item: ArrayQueryItem<Q>,
): void {
  ctx.query(query, args).update((list) => [item, ...((list as unknown[]) ?? [])] as FunctionReturnType<Q>)
}

/**
 * Append an item to a query result that returns an array.
 */
export function appendTo<Q extends FunctionReference<'query'>>(
  ctx: OptimisticContext,
  query: Q,
  args: FunctionArgs<Q>,
  item: ArrayQueryItem<Q>,
): void {
  ctx.query(query, args).update((list) => [...((list as unknown[]) ?? []), item] as FunctionReturnType<Q>)
}

/**
 * Remove items from a query result that returns an array, using a predicate.
 *
 * @example
 * ```ts
 * const deleteNote = useConvexMutation(api.notes.delete, {
 *   optimisticUpdate: (ctx, args) =>
 *     removeFrom(ctx, api.notes.list, {}, (note) => note._id === args.id),
 * })
 * ```
 */
export function removeFrom<Q extends FunctionReference<'query'>>(
  ctx: OptimisticContext,
  query: Q,
  args: FunctionArgs<Q>,
  predicate: (item: ArrayQueryItem<Q>) => boolean,
): void {
  ctx.query(query, args).update(
    (list) => ((list as unknown[]) ?? []).filter((i) => !predicate(i as ArrayQueryItem<Q>)) as FunctionReturnType<Q>,
  )
}

/**
 * Update items in a query result that returns an array, applying an updater to matching items.
 *
 * @example
 * ```ts
 * const updateNote = useConvexMutation(api.notes.update, {
 *   optimisticUpdate: (ctx, args) =>
 *     updateIn(ctx, api.notes.list, {}, (note) => note._id === args.id, (note) => ({ ...note, ...args })),
 * })
 * ```
 */
export function updateIn<Q extends FunctionReference<'query'>>(
  ctx: OptimisticContext,
  query: Q,
  args: FunctionArgs<Q>,
  predicate: (item: ArrayQueryItem<Q>) => boolean,
  updater: (item: ArrayQueryItem<Q>) => ArrayQueryItem<Q>,
): void {
  ctx.query(query, args).update(
    (list) =>
      ((list as unknown[]) ?? []).map((i) => {
        const item = i as ArrayQueryItem<Q>
        return predicate(item) ? updater(item) : item
      }) as FunctionReturnType<Q>,
  )
}
