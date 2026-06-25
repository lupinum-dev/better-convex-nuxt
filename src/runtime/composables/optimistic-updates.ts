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

export {
  deleteFromQuery,
  setQueryData,
  updateAllQueries,
  updateQuery,
  type DeleteFromQueryOptions,
  type SetQueryDataOptions,
  type UpdateAllQueriesOptions,
  type UpdateQueryOptions,
} from './regular-optimistic-updates'

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
  PaginationResult<unknown>
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

  updateMatchingPaginatedQueries({ query, argsToMatch, store }, (paginatedValue) => {
    return {
      ...paginatedValue,
      page: [item, ...paginatedValue.page],
    }
  })
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

  updateMatchingPaginatedQueries({ query, argsToMatch, store }, (paginatedValue) => {
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

    return {
      ...paginatedValue,
      page: newPage,
    }
  })
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

  updateMatchingPaginatedQueries({ query, argsToMatch, store }, (paginatedValue) => {
    if (!paginatedValue.isDone) {
      return undefined
    }

    return {
      ...paginatedValue,
      page: [...paginatedValue.page, item],
    }
  })
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

  updateMatchingPaginatedQueries({ query, argsToMatch, store }, (paginatedValue) => {
    return {
      ...paginatedValue,
      page: paginatedValue.page.map(updateValue),
    }
  })
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

  updateMatchingPaginatedQueries({ query, argsToMatch, store }, (paginatedValue) => {
    return {
      ...paginatedValue,
      page: paginatedValue.page.filter((item) => !shouldDelete(item)),
    }
  })
}

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

function updateMatchingPaginatedQueries<Query extends PaginatedQueryReference>(
  options: {
    query: Query
    argsToMatch?: Partial<PaginatedQueryArgs<Query>>
    store: OptimisticLocalStore
  },
  updater: (
    currentValue: PaginationResult<PaginatedQueryItem<Query>>,
  ) => PaginationResult<PaginatedQueryItem<Query>> | undefined,
): void {
  const { query, argsToMatch, store } = options
  const allQueries = store.getAllQueries(query)

  for (const { args, value } of allQueries) {
    if (argsToMatch && !argsMatchForPaginatedQuery(args, argsToMatch)) {
      continue
    }

    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>
    const newValue = updater(paginatedValue)
    if (newValue === undefined) continue

    store.setQuery(query, args, newValue)
  }
}

/**
 * Compare two JSON values for sorting.
 * Uses shared comparison utility.
 * @internal
 */
function compareJsonValues(a: unknown, b: unknown): number {
  return sharedCompareJsonValues(a, b)
}
