/**
 * Optimistic update helpers for Convex mutations.
 *
 * These helpers make it easy to update local query results immediately
 * while mutations are in flight, providing instant UI feedback.
 *
 * Helpers are split into two categories:
 * 1. Regular query helpers (updateQuery, setQueryData, updateAllQueries, deleteFromQuery)
 * 2. Paginated query helpers (insertAtTop, insertAtPosition, insertAtBottomIfLoaded, etc.)
 */

import type { OptimisticLocalStore } from 'convex/browser'
import type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
  PaginationResult,
  PaginationOptions,
} from 'convex/server'
import { convexToJson, type Value } from 'convex/values'

import {
  argsMatch as sharedArgsMatch,
  compareJsonValues as sharedCompareJsonValues,
} from '../utils/shared-helpers'

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
// Regular Query Optimistic Update Helpers
// ============================================================================

/**
 * Options for updateQuery helper
 */
export interface UpdateQueryOptions<Query extends FunctionReference<'query'>> {
  /** The query function reference */
  query: Query
  /** The args to match the specific query */
  args: FunctionArgs<Query>
  /** The local store from optimistic update context */
  store: OptimisticLocalStore
  /**
   * Updater function. Receives current value (or undefined if not loaded).
   * Return the new value.
   */
  updater: (currentValue: FunctionReturnType<Query> | undefined) => FunctionReturnType<Query>
}

/**
 * Update a regular query result with an updater function.
 *
 * Use this in optimistic updates when you need to modify a query result
 * based on its current value (e.g., adding to a list, incrementing a counter).
 *
 * @example
 * ```ts
 * const { execute } = useConvexMutation(api.notes.add, {
 *   optimisticUpdate: (localStore, args) => {
 *     updateQuery({
 *       query: api.notes.list,
 *       args: { userId: args.userId },
 *       store: localStore,
 *       updater: (current) => {
 *         const newNote = { _id: crypto.randomUUID(), ...args }
 *         return current ? [newNote, ...current] : [newNote]
 *       },
 *     })
 *   },
 * })
 * ```
 */
export function updateQuery<Query extends FunctionReference<'query'>>(
  options: UpdateQueryOptions<Query>,
): void {
  const { query, args, store, updater } = options

  const currentValue = store.getQuery(query, args)
  const newValue = updater(currentValue)
  store.setQuery(query, args, newValue)
}

/**
 * Options for setQueryData helper
 */
export interface SetQueryDataOptions<Query extends FunctionReference<'query'>> {
  /** The query function reference */
  query: Query
  /** The args to match the specific query */
  args: FunctionArgs<Query>
  /** The local store from optimistic update context */
  store: OptimisticLocalStore
  /** The new value to set */
  value: FunctionReturnType<Query>
}

/**
 * Set a query result directly to a new value.
 *
 * Use this in optimistic updates when you know the exact new value
 * and don't need to compute it from the current value.
 *
 * @example
 * ```ts
 * const { execute } = useConvexMutation(api.users.updateProfile, {
 *   optimisticUpdate: (localStore, args) => {
 *     setQueryData({
 *       query: api.users.get,
 *       args: { userId: args.userId },
 *       store: localStore,
 *       value: { ...existingUser, name: args.name },
 *     })
 *   },
 * })
 * ```
 */
export function setQueryData<Query extends FunctionReference<'query'>>(
  options: SetQueryDataOptions<Query>,
): void {
  const { query, args, store, value } = options
  store.setQuery(query, args, value)
}

/**
 * Options for updateAllQueries helper
 */
export interface UpdateAllQueriesOptions<Query extends FunctionReference<'query'>> {
  /** The query function reference */
  query: Query
  /** Optional args to filter which queries to update. If not provided, updates all. */
  argsToMatch?: Partial<FunctionArgs<Query>>
  /** The local store from optimistic update context */
  store: OptimisticLocalStore
  /**
   * Updater function. Receives current value (or undefined if not loaded) and args.
   * Return the new value, or undefined to skip updating this query.
   */
  updater: (
    currentValue: FunctionReturnType<Query> | undefined,
    args: FunctionArgs<Query>,
  ) => FunctionReturnType<Query> | undefined
}

/**
 * Update all instances of a query that match the filter.
 *
 * Use this when you need to update multiple query results with the same
 * function reference but different args (e.g., updating a user's name
 * across all queries that display it).
 *
 * @example
 * ```ts
 * const { execute } = useConvexMutation(api.users.updateName, {
 *   optimisticUpdate: (localStore, args) => {
 *     updateAllQueries({
 *       query: api.users.get,
 *       argsToMatch: { userId: args.userId },
 *       store: localStore,
 *       updater: (current) => {
 *         if (!current) return undefined // Skip if not loaded
 *         return { ...current, name: args.name }
 *       },
 *     })
 *   },
 * })
 * ```
 */
export function updateAllQueries<Query extends FunctionReference<'query'>>(
  options: UpdateAllQueriesOptions<Query>,
): void {
  const { query, argsToMatch, store, updater } = options

  const allQueries = store.getAllQueries(query)

  for (const { args, value } of allQueries) {
    // Skip if args don't match filter
    if (argsToMatch && !argsMatchForRegularQuery(args, argsToMatch)) {
      continue
    }

    const newValue = updater(value, args)

    // Only update if updater returned a value
    if (newValue !== undefined) {
      store.setQuery(query, args, newValue)
    }
  }
}

/**
 * Options for deleteFromQuery helper
 */
export interface DeleteFromQueryOptions<
  Query extends FunctionReference<'query'>,
  Item = FunctionReturnType<Query> extends (infer T)[] ? T : never,
> {
  /** The query function reference (must return an array) */
  query: Query
  /** The args to match the specific query */
  args: FunctionArgs<Query>
  /** The local store from optimistic update context */
  store: OptimisticLocalStore
  /** Predicate to identify items to delete. Return true to delete the item. */
  shouldDelete: (item: Item) => boolean
}

/**
 * Delete items from a query result that returns an array.
 *
 * Use this to optimistically remove items from array-type queries.
 *
 * @example
 * ```ts
 * const { execute } = useConvexMutation(api.notes.remove, {
 *   optimisticUpdate: (localStore, args) => {
 *     deleteFromQuery({
 *       query: api.notes.list,
 *       args: { userId: currentUserId },
 *       store: localStore,
 *       shouldDelete: (note) => note._id === args.noteId,
 *     })
 *   },
 * })
 * ```
 */
export function deleteFromQuery<
  Query extends FunctionReference<'query'>,
  Item = FunctionReturnType<Query> extends (infer T)[] ? T : never,
>(options: DeleteFromQueryOptions<Query, Item>): void {
  const { query, args, store, shouldDelete } = options

  const currentValue = store.getQuery(query, args)

  // Skip if query not loaded or not an array
  if (!currentValue || !Array.isArray(currentValue)) {
    return
  }

  const newValue = currentValue.filter((item: Item) => !shouldDelete(item))
  store.setQuery(query, args, newValue as FunctionReturnType<Query>)
}

// ============================================================================
// Paginated Query Optimistic Update Helpers
// ============================================================================

/**
 * Options for insertAtTop helper
 */
export interface InsertAtTopOptions<Query extends PaginatedQueryReference> {
  /** The paginated query function reference */
  query: Query
  /** Optional args to match specific paginated queries. If not provided, updates all. */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  /** The local store from optimistic update context */
  store: OptimisticLocalStore
  /** The item to insert at the top of results */
  item: PaginatedQueryItem<Query>
}

/**
 * Insert an item at the top of paginated results.
 *
 * Use this in optimistic updates when you want new items to appear
 * immediately at the top of a feed or list (e.g., chat messages, activity feeds).
 *
 * @example
 * ```ts
 * const sendMessage = useMutation(api.messages.send)
 *   .withOptimisticUpdate((localStore, args) => {
 *     insertAtTop({
 *       query: api.messages.list,
 *       store: localStore,
 *       item: {
 *         _id: crypto.randomUUID() as Id<"messages">,
 *         _creationTime: Date.now(),
 *         body: args.body,
 *         author: currentUser._id,
 *       },
 *     })
 *   })
 * ```
 */
export function insertAtTop<Query extends PaginatedQueryReference>(
  options: InsertAtTopOptions<Query>,
): void {
  const { query, argsToMatch, store, item } = options

  // Get all queries matching this function
  const allQueries = store.getAllQueries(query)

  for (const { args, value } of allQueries) {
    // Skip if args don't match filter
    if (argsToMatch && !argsMatchForPaginatedQuery(args, argsToMatch)) {
      continue
    }

    // Skip if no value yet (query hasn't loaded)
    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>

    // Insert item at the beginning of the page
    const newPage = [item, ...paginatedValue.page]

    store.setQuery(query, args, {
      ...paginatedValue,
      page: newPage,
    })
  }
}

/**
 * Options for insertAtPosition helper
 */
export interface InsertAtPositionOptions<Query extends PaginatedQueryReference> {
  /** The paginated query function reference */
  query: Query
  /** Optional args to match specific paginated queries. If not provided, updates all. */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  /** Sort order of the paginated query ('asc' or 'desc') */
  sortOrder: 'asc' | 'desc'
  /** Function to extract the sort key from an item */
  sortKeyFromItem: (item: PaginatedQueryItem<Query>) => Value | Value[]
  /** The local store from optimistic update context */
  store: OptimisticLocalStore
  /** The item to insert at the correct sorted position */
  item: PaginatedQueryItem<Query>
}

/**
 * Insert an item at its sorted position in paginated results.
 *
 * Use this when your paginated query is sorted by a specific field
 * and you want the new item to appear in the correct position.
 *
 * @example
 * ```ts
 * const addTask = useMutation(api.tasks.add)
 *   .withOptimisticUpdate((localStore, args) => {
 *     insertAtPosition({
 *       query: api.tasks.listByPriority,
 *       sortOrder: 'desc',
 *       sortKeyFromItem: (task) => task.priority,
 *       store: localStore,
 *       item: {
 *         _id: crypto.randomUUID() as Id<"tasks">,
 *         _creationTime: Date.now(),
 *         title: args.title,
 *         priority: args.priority,
 *       },
 *     })
 *   })
 * ```
 */
export function insertAtPosition<Query extends PaginatedQueryReference>(
  options: InsertAtPositionOptions<Query>,
): void {
  const { query, argsToMatch, sortOrder, sortKeyFromItem, store, item } = options

  const allQueries = store.getAllQueries(query)

  for (const { args, value } of allQueries) {
    if (argsToMatch && !argsMatchForPaginatedQuery(args, argsToMatch)) {
      continue
    }

    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>
    const newItemKey = sortKeyFromItem(item)
    const newItemKeyJson = convexToJson(newItemKey)

    // Find the correct position to insert
    let insertIndex = paginatedValue.page.length

    for (let i = 0; i < paginatedValue.page.length; i++) {
      const existingItem = paginatedValue.page[i]
      if (!existingItem) continue

      const existingKey = sortKeyFromItem(existingItem)
      const existingKeyJson = convexToJson(existingKey)

      const comparison = compareJsonValues(newItemKeyJson, existingKeyJson)

      if (sortOrder === 'desc') {
        // For descending, insert when new item is greater than or equal
        if (comparison >= 0) {
          insertIndex = i
          break
        }
      } else {
        // For ascending, insert when new item is less than or equal
        if (comparison <= 0) {
          insertIndex = i
          break
        }
      }
    }

    const newPage = [
      ...paginatedValue.page.slice(0, insertIndex),
      item,
      ...paginatedValue.page.slice(insertIndex),
    ]

    store.setQuery(query, args, {
      ...paginatedValue,
      page: newPage,
    })
  }
}

/**
 * Options for insertAtBottomIfLoaded helper
 */
export interface InsertAtBottomIfLoadedOptions<Query extends PaginatedQueryReference> {
  /** The paginated query function reference */
  query: Query
  /** Optional args to match specific paginated queries. If not provided, updates all. */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  /** The local store from optimistic update context */
  store: OptimisticLocalStore
  /** The item to insert at the bottom of results */
  item: PaginatedQueryItem<Query>
}

/**
 * Insert an item at the bottom of paginated results, but only if all pages are loaded.
 *
 * Use this when you have ascending-sorted data and want new items to appear
 * at the end. The item will only be inserted if `isDone` is true (all pages loaded),
 * otherwise the server will include it when more pages are fetched.
 *
 * @example
 * ```ts
 * const addOldMessage = useMutation(api.messages.add)
 *   .withOptimisticUpdate((localStore, args) => {
 *     insertAtBottomIfLoaded({
 *       query: api.messages.listOldestFirst,
 *       store: localStore,
 *       item: {
 *         _id: crypto.randomUUID() as Id<"messages">,
 *         _creationTime: Date.now(),
 *         body: args.body,
 *       },
 *     })
 *   })
 * ```
 */
export function insertAtBottomIfLoaded<Query extends PaginatedQueryReference>(
  options: InsertAtBottomIfLoadedOptions<Query>,
): void {
  const { query, argsToMatch, store, item } = options

  const allQueries = store.getAllQueries(query)

  for (const { args, value } of allQueries) {
    if (argsToMatch && !argsMatchForPaginatedQuery(args, argsToMatch)) {
      continue
    }

    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>

    // Only insert if all pages are loaded (isDone is true)
    if (!paginatedValue.isDone) {
      continue
    }

    const newPage = [...paginatedValue.page, item]

    store.setQuery(query, args, {
      ...paginatedValue,
      page: newPage,
    })
  }
}

/**
 * Options for updateInPaginatedQuery helper
 */
export interface UpdateInPaginatedQueryOptions<Query extends PaginatedQueryReference> {
  /** The paginated query function reference */
  query: Query
  /** Optional args to match specific paginated queries. If not provided, updates all. */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  /** The local store from optimistic update context */
  store: OptimisticLocalStore
  /** Function to update matching items. Return the item unchanged if no update needed. */
  updateValue: (currentValue: PaginatedQueryItem<Query>) => PaginatedQueryItem<Query>
}

/**
 * Update items in paginated results.
 *
 * Use this to optimistically update existing items in paginated queries,
 * such as editing, toggling status, or marking as read.
 *
 * @example
 * ```ts
 * const toggleComplete = useMutation(api.tasks.toggleComplete)
 *   .withOptimisticUpdate((localStore, args) => {
 *     updateInPaginatedQuery({
 *       query: api.tasks.list,
 *       store: localStore,
 *       updateValue: (task) => {
 *         if (task._id === args.taskId) {
 *           return { ...task, completed: !task.completed }
 *         }
 *         return task
 *       },
 *     })
 *   })
 * ```
 */
export function updateInPaginatedQuery<Query extends PaginatedQueryReference>(
  options: UpdateInPaginatedQueryOptions<Query>,
): void {
  const { query, argsToMatch, store, updateValue } = options

  const allQueries = store.getAllQueries(query)

  for (const { args, value } of allQueries) {
    if (argsToMatch && !argsMatchForPaginatedQuery(args, argsToMatch)) {
      continue
    }

    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>

    const newPage = paginatedValue.page.map(updateValue)

    store.setQuery(query, args, {
      ...paginatedValue,
      page: newPage,
    })
  }
}

/**
 * Options for deleteFromPaginatedQuery helper
 */
export interface DeleteFromPaginatedQueryOptions<Query extends PaginatedQueryReference> {
  /** The paginated query function reference */
  query: Query
  /** Optional args to match specific paginated queries. If not provided, updates all. */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  /** The local store from optimistic update context */
  store: OptimisticLocalStore
  /** Predicate to identify items to delete. Return true to delete the item. */
  shouldDelete: (item: PaginatedQueryItem<Query>) => boolean
}

/**
 * Delete items from paginated results.
 *
 * Use this to optimistically remove items from paginated queries.
 *
 * @example
 * ```ts
 * const deleteTask = useMutation(api.tasks.delete)
 *   .withOptimisticUpdate((localStore, args) => {
 *     deleteFromPaginatedQuery({
 *       query: api.tasks.list,
 *       store: localStore,
 *       shouldDelete: (task) => task._id === args.taskId,
 *     })
 *   })
 * ```
 */
export function deleteFromPaginatedQuery<Query extends PaginatedQueryReference>(
  options: DeleteFromPaginatedQueryOptions<Query>,
): void {
  const { query, argsToMatch, store, shouldDelete } = options

  const allQueries = store.getAllQueries(query)

  for (const { args, value } of allQueries) {
    if (argsToMatch && !argsMatchForPaginatedQuery(args, argsToMatch)) {
      continue
    }

    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>

    const newPage = paginatedValue.page.filter((item) => !shouldDelete(item))

    store.setQuery(query, args, {
      ...paginatedValue,
      page: newPage,
    })
  }
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Check if query args match the filter args for regular queries.
 * Uses deep equality comparison from shared utilities.
 * @internal
 */
function argsMatchForRegularQuery(
  queryArgs: Record<string, unknown>,
  filterArgs: Record<string, unknown>,
): boolean {
  return sharedArgsMatch(queryArgs, filterArgs)
}

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

/**
 * Compare two JSON values for sorting.
 * Uses shared comparison utility.
 * @internal
 */
function compareJsonValues(a: unknown, b: unknown): number {
  return sharedCompareJsonValues(a, b)
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
  /** Insert an item at a specific position across all pages. */
  insertAtPosition: (item: PaginatedQueryItem<Query>, position: number) => void
  /** Insert an item at the bottom of the last loaded page (only if all pages are loaded). */
  insertAtBottomIfLoaded: (item: PaginatedQueryItem<Query>) => void
  /** Update all items that match the predicate. */
  updateItem: (id: string, updater: (item: PaginatedQueryItem<Query>) => PaginatedQueryItem<Query>) => void
  /** Remove all items that match the predicate. */
  deleteItem: (id: string) => void
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
   * Escape hatch: direct access to the underlying Convex OptimisticLocalStore.
   * Use when the builder methods don't cover your use case.
   */
  store: OptimisticLocalStore
}

/**
 * Create an OptimisticContext that wraps a Convex OptimisticLocalStore
 * with a typed, discoverable builder API.
 * @internal — used by createConvexCallState in useConvexMutation
 */
export function createOptimisticContext(store: OptimisticLocalStore): OptimisticContext {
  return {
    store,

    query<Q extends FunctionReference<'query'>>(query: Q, args: FunctionArgs<Q>): OptimisticQueryHandle<Q> {
      return {
        update(updater) {
          updateQuery({ query, args, store, updater })
        },
        set(value) {
          store.setQuery(query, args, value)
        },
      }
    },

    paginatedQuery<Q extends PaginatedQueryReference>(
      query: Q,
      args: PaginatedQueryArgs<Q>,
    ): OptimisticPaginatedHandle<Q> {
      return {
        insertAtTop(item) {
          insertAtTop({ query, store, item })
        },
        insertAtPosition(item, position) {
          insertAtPosition({ query, store, item, position })
        },
        insertAtBottomIfLoaded(item) {
          insertAtBottomIfLoaded({ query, store, item })
        },
        updateItem(id, updater) {
          updateInPaginatedQuery({
            query,
            store,
            argsToMatch: args as Record<string, unknown>,
            shouldUpdate: (item) => (item as { _id?: string })._id === id,
            updater,
          })
        },
        deleteItem(id) {
          deleteFromPaginatedQuery({
            query,
            store,
            argsToMatch: args as Record<string, unknown>,
            shouldDelete: (item) => (item as { _id?: string })._id === id,
          })
        },
      }
    },
  }
}
