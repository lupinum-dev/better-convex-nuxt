import type { OptimisticLocalStore } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { argsMatch as sharedArgsMatch } from '../utils/shared-helpers'

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
 * function reference but different args.
 */
export function updateAllQueries<Query extends FunctionReference<'query'>>(
  options: UpdateAllQueriesOptions<Query>,
): void {
  const { query, argsToMatch, store, updater } = options

  const allQueries = store.getAllQueries(query)

  for (const { args, value } of allQueries) {
    if (argsToMatch && !sharedArgsMatch(args, argsToMatch)) {
      continue
    }

    const newValue = updater(value, args)
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
 */
export function deleteFromQuery<
  Query extends FunctionReference<'query'>,
  Item = FunctionReturnType<Query> extends (infer T)[] ? T : never,
>(options: DeleteFromQueryOptions<Query, Item>): void {
  const { query, args, store, shouldDelete } = options

  const currentValue = store.getQuery(query, args)
  if (!currentValue || !Array.isArray(currentValue)) {
    return
  }

  const newValue = currentValue.filter((item: Item) => !shouldDelete(item))
  store.setQuery(query, args, newValue as FunctionReturnType<Query>)
}
