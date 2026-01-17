import type { OptimisticLocalStore } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { useRuntimeConfig } from '#imports'

import { getFunctionName } from '../utils/convex-cache'
import { createLogger, getLogLevel } from '../utils/logger'
import {
  registerDevToolsEntry,
  updateDevToolsSuccess,
  updateDevToolsError,
} from '../utils/devtools-helpers'
import { useConvex } from './useConvex'

// Re-export optimistic update helpers for backwards compatibility
export {
  updateQuery,
  setQueryData,
  updateAllQueries,
  deleteFromQuery,
  type UpdateQueryOptions,
  type SetQueryDataOptions,
  type UpdateAllQueriesOptions,
  type DeleteFromQueryOptions,
} from './optimistic-updates'

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
    const startTime = Date.now()

    if (!client) {
      const err = new Error('ConvexClient not available - mutations only work on client side')
      _status.value = 'error'
      error.value = err
      logger.mutation({ name: fnName, event: 'error', error: err })
      throw err
    }

    _status.value = 'pending'
    error.value = null

    // Register with DevTools
    const mutationId = registerDevToolsEntry(fnName, 'mutation', args, hasOptimisticUpdate)

    // Log optimistic update if present
    if (hasOptimisticUpdate) {
      logger.mutation({ name: fnName, event: 'optimistic', args })
    }

    try {
      const result = await client.mutation(mutation, args, {
        optimisticUpdate: options?.optimisticUpdate,
      })
      _status.value = 'success'
      data.value = result

      // Update DevTools
      updateDevToolsSuccess(mutationId, startTime, result)

      const duration = Date.now() - startTime
      logger.mutation({ name: fnName, event: 'success', args, duration })

      return result
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      _status.value = 'error'
      error.value = err

      // Update DevTools
      updateDevToolsError(mutationId, startTime, err.message)

      const duration = Date.now() - startTime
      logger.mutation({ name: fnName, event: 'error', args, duration, error: err })

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
