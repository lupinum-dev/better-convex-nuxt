import type { OptimisticLocalStore } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { useRuntimeConfig } from '#imports'

import { getFunctionName } from '../utils/convex-cache'
import { createLogger, getLogLevel } from '../utils/logger'
import { argsMatch as sharedArgsMatch } from '../utils/shared-helpers'
import { useConvex } from './useConvex'

// ============================================================================
// DevTools Integration
// ============================================================================

let devToolsMutationRegistry: typeof import('../devtools/mutation-registry') | null = null

if (import.meta.client && import.meta.dev) {
  import('../devtools/mutation-registry')
    .then((module) => {
      devToolsMutationRegistry = module
    })
    .catch(() => {
      // DevTools not available, ignore
    })
}

/**
 * Mutation status representing the current state of the mutation
 * - 'idle': not yet called or reset
 * - 'pending': mutation in progress
 * - 'success': mutation completed successfully
 * - 'error': mutation failed
 */
export type MutationStatus = 'idle' | 'pending' | 'success' | 'error'

/**
 * Return value from useConvexMutation
 */
export interface UseConvexMutationReturn<Args, Result> {
  /**
   * Execute the mutation. Returns a promise with the result.
   * Automatically tracks status, error, and data.
   * Throws on error (use try/catch or check error ref after).
   */
  mutate: (args: Args) => Promise<Result>

  /**
   * Result data from the last successful mutation.
   * undefined if mutation hasn't succeeded yet.
   */
  data: Ref<Result | undefined>

  /**
   * Mutation status for explicit state management.
   */
  status: ComputedRef<MutationStatus>

  /**
   * True when mutation is in progress.
   * Equivalent to status === 'pending'.
   */
  pending: ComputedRef<boolean>

  /**
   * Error from the last mutation attempt.
   * null if no error or mutation hasn't been called.
   */
  error: Ref<Error | null>

  /**
   * Reset mutation state back to idle.
   * Clears error and data.
   */
  reset: () => void
}

/**
 * Options for useConvexMutation
 */
export interface UseConvexMutationOptions<Args extends Record<string, unknown>> {
  /**
   * Optimistic update function. Receives Convex's OptimisticLocalStore and mutation args.
   * Called immediately before the mutation is sent to server.
   * Automatically rolled back when the mutation completes and server data arrives.
   *
   * Use this to update local query results for instant UI feedback.
   *
   * @example
   * ```ts
   * const { mutate } = useConvexMutation(api.notes.add, {
   *   optimisticUpdate: (localStore, args) => {
   *     // Update a regular query
   *     updateQuery({
   *       query: api.notes.list,
   *       args: {},
   *       localQueryStore: localStore,
   *       updater: (current) => current ? [newNote, ...current] : [newNote]
   *     })
   *
   *     // Or update a paginated query
   *     insertAtTop({
   *       paginatedQuery: api.notes.listPaginated,
   *       localQueryStore: localStore,
   *       item: { _id: crypto.randomUUID(), ...args }
   *     })
   *   }
   * })
   * ```
   */
  optimisticUpdate?: (localStore: OptimisticLocalStore, args: Args) => void
}

// ============================================================================
// Optimistic Update Helpers for Regular Queries
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
  localQueryStore: OptimisticLocalStore
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
 * const { mutate } = useConvexMutation(api.notes.add, {
 *   optimisticUpdate: (localStore, args) => {
 *     updateQuery({
 *       query: api.notes.list,
 *       args: { userId: args.userId },
 *       localQueryStore: localStore,
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
  const { query, args, localQueryStore, updater } = options

  const currentValue = localQueryStore.getQuery(query, args)
  const newValue = updater(currentValue)
  localQueryStore.setQuery(query, args, newValue)
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
  localQueryStore: OptimisticLocalStore
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
 * const { mutate } = useConvexMutation(api.users.updateProfile, {
 *   optimisticUpdate: (localStore, args) => {
 *     setQueryData({
 *       query: api.users.get,
 *       args: { userId: args.userId },
 *       localQueryStore: localStore,
 *       value: { ...existingUser, name: args.name },
 *     })
 *   },
 * })
 * ```
 */
export function setQueryData<Query extends FunctionReference<'query'>>(
  options: SetQueryDataOptions<Query>,
): void {
  const { query, args, localQueryStore, value } = options
  localQueryStore.setQuery(query, args, value)
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
  localQueryStore: OptimisticLocalStore
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
 * const { mutate } = useConvexMutation(api.users.updateName, {
 *   optimisticUpdate: (localStore, args) => {
 *     updateAllQueries({
 *       query: api.users.get,
 *       argsToMatch: { userId: args.userId },
 *       localQueryStore: localStore,
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
  const { query, argsToMatch, localQueryStore, updater } = options

  const allQueries = localQueryStore.getAllQueries(query)

  for (const { args, value } of allQueries) {
    // Skip if args don't match filter
    if (argsToMatch && !argsMatch(args, argsToMatch)) {
      continue
    }

    const newValue = updater(value, args)

    // Only update if updater returned a value
    if (newValue !== undefined) {
      localQueryStore.setQuery(query, args, newValue)
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
  localQueryStore: OptimisticLocalStore
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
 * const { mutate } = useConvexMutation(api.notes.remove, {
 *   optimisticUpdate: (localStore, args) => {
 *     deleteFromQuery({
 *       query: api.notes.list,
 *       args: { userId: currentUserId },
 *       localQueryStore: localStore,
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
  const { query, args, localQueryStore, shouldDelete } = options

  const currentValue = localQueryStore.getQuery(query, args)

  // Skip if query not loaded or not an array
  if (!currentValue || !Array.isArray(currentValue)) {
    return
  }

  const newValue = currentValue.filter((item: Item) => !shouldDelete(item))
  localQueryStore.setQuery(query, args, newValue as FunctionReturnType<Query>)
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Check if query args match the filter args.
 * Uses deep equality comparison from shared utilities.
 * @internal
 */
function argsMatch(
  queryArgs: Record<string, unknown>,
  filterArgs: Record<string, unknown>,
): boolean {
  return sharedArgsMatch(queryArgs, filterArgs)
}

/**
 * Composable for calling Convex mutations with automatic state tracking.
 *
 * Returns a mutation function along with reactive status, error, and data refs.
 * The mutation automatically tracks its state - no manual loading refs needed.
 *
 * API designed to match useConvexQuery for consistency:
 * - `data` - result from last successful call
 * - `status` - 'idle' | 'pending' | 'success' | 'error'
 * - `pending` - boolean shorthand for status === 'pending'
 * - `error` - Error | null
 *
 * Note: Mutations only work on the client side.
 *
 * @example Basic usage with status tracking
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const {
 *   mutate: createPost,
 *   pending,
 *   status,
 *   error,
 * } = useConvexMutation(api.posts.create)
 *
 * async function handleSubmit() {
 *   try {
 *     await createPost({ title: 'Hello' })
 *   } catch {
 *     // error is automatically tracked
 *   }
 * }
 * </script>
 *
 * <template>
 *   <button :disabled="pending" @click="handleSubmit">
 *     {{ pending ? 'Creating...' : 'Create' }}
 *   </button>
 *   <p v-if="status === 'error'" class="error">{{ error?.message }}</p>
 *   <p v-if="status === 'success'">Created!</p>
 * </template>
 * ```
 *
 * @example Multiple mutations with individual state
 * ```vue
 * <script setup>
 * const {
 *   mutate: createPost,
 *   pending: isCreating,
 *   error: createError,
 * } = useConvexMutation(api.posts.create)
 *
 * const {
 *   mutate: deletePost,
 *   pending: isDeleting,
 *   error: deleteError,
 * } = useConvexMutation(api.posts.remove)
 * </script>
 * ```
 *
 * @example With optimistic update for paginated queries
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 * import { insertAtTop } from '#imports'
 *
 * const { mutate: addNote, pending } = useConvexMutation(api.notes.add, {
 *   optimisticUpdate: (localStore, args) => {
 *     insertAtTop({
 *       paginatedQuery: api.notes.listPaginated,
 *       localQueryStore: localStore,
 *       item: {
 *         _id: crypto.randomUUID() as Id<'notes'>,
 *         _creationTime: Date.now(),
 *         title: args.title,
 *         content: args.content,
 *       },
 *     })
 *   },
 * })
 * </script>
 * ```
 *
 * @example With optimistic update for regular queries
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 * import { updateQuery, deleteFromQuery } from '#imports'
 *
 * // Add to a list query
 * const { mutate: addNote } = useConvexMutation(api.notes.add, {
 *   optimisticUpdate: (localStore, args) => {
 *     updateQuery({
 *       query: api.notes.list,
 *       args: { userId: args.userId },
 *       localQueryStore: localStore,
 *       updater: (current) => {
 *         const newNote = {
 *           _id: crypto.randomUUID() as Id<'notes'>,
 *           _creationTime: Date.now(),
 *           ...args,
 *         }
 *         return current ? [newNote, ...current] : [newNote]
 *       },
 *     })
 *   },
 * })
 *
 * // Remove from a list query
 * const { mutate: removeNote } = useConvexMutation(api.notes.remove, {
 *   optimisticUpdate: (localStore, args) => {
 *     deleteFromQuery({
 *       query: api.notes.list,
 *       args: { userId: currentUserId.value },
 *       localQueryStore: localStore,
 *       shouldDelete: (note) => note._id === args.noteId,
 *     })
 *   },
 * })
 * </script>
 * ```
 */
export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  options?: UseConvexMutationOptions<FunctionArgs<Mutation>>,
): UseConvexMutationReturn<FunctionArgs<Mutation>, FunctionReturnType<Mutation>> {
  type Args = FunctionArgs<Mutation>
  type Result = FunctionReturnType<Mutation>

  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = createLogger(logLevel)
  const fnName = getFunctionName(mutation)
  const hasOptimisticUpdate = !!options?.optimisticUpdate

  // Internal state
  const _status = ref<MutationStatus>('idle')
  const error = ref<Error | null>(null) as Ref<Error | null>
  const data = ref<Result | undefined>(undefined) as Ref<Result | undefined>

  // Computed - matches useConvexQuery pattern
  const status = computed(() => _status.value)
  const pending = computed(() => _status.value === 'pending')

  // Reset function
  const reset = () => {
    _status.value = 'idle'
    error.value = null
    data.value = undefined
  }

  // The mutation function
  const mutate = async (args: Args): Promise<Result> => {
    const client = useConvex()
    const endTime = logger.time(`${fnName}`)

    if (!client) {
      const err = new Error('ConvexClient not available - mutations only work on client side')
      _status.value = 'error'
      error.value = err
      logger.error(`${fnName} failed: client not available`)
      throw err
    }

    _status.value = 'pending'
    error.value = null

    // Register with DevTools
    const startTime = Date.now()
    let mutationId: string | null = null
    if (import.meta.dev && devToolsMutationRegistry) {
      mutationId = devToolsMutationRegistry.registerMutation({
        name: fnName,
        type: 'mutation',
        args,
        state: hasOptimisticUpdate ? 'optimistic' : 'pending',
        hasOptimisticUpdate,
        startedAt: startTime,
      })
    }

    try {
      const result = await client.mutation(mutation, args, {
        optimisticUpdate: options?.optimisticUpdate,
      })
      _status.value = 'success'
      data.value = result

      // Update DevTools
      const settledAt = Date.now()
      if (import.meta.dev && devToolsMutationRegistry && mutationId) {
        devToolsMutationRegistry.updateMutationState(mutationId, {
          state: 'success',
          result,
          settledAt,
          duration: settledAt - startTime,
        })
      }

      endTime()
      logger.info(`${fnName} succeeded${hasOptimisticUpdate ? ' (optimistic)' : ''}`)

      return result
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      _status.value = 'error'
      error.value = err

      // Update DevTools
      const settledAt = Date.now()
      if (import.meta.dev && devToolsMutationRegistry && mutationId) {
        devToolsMutationRegistry.updateMutationState(mutationId, {
          state: 'error',
          error: err.message,
          settledAt,
          duration: settledAt - startTime,
        })
      }

      endTime()
      logger.error(`${fnName} failed`, err)

      throw err
    }
  }

  return {
    mutate,
    data,
    status,
    pending,
    error,
    reset,
  }
}
