import type { OptimisticLocalStore } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { ref, computed, type Ref, type ComputedRef } from 'vue'

import { useNuxtApp, useRuntimeConfig } from '#imports'

import {
  registerDevtoolsEntry,
  updateDevtoolsEntrySuccess,
  updateDevtoolsEntryError,
} from '../devtools/runtime'
import { handleUnauthorizedAuthFailure } from '../utils/auth-unauthorized'
import { toConvexError } from '../utils/call-result'
import { getFunctionName } from '../utils/convex-cache'
import { getSharedLogger, getLogLevel, type Logger } from '../utils/logger'
import type { ConvexCallStatus } from '../utils/types'
import { getRequiredConvexClient } from './useConvex'

// Re-export optimistic update helpers
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
 * Return value from useConvexMutation
 */
export interface UseConvexMutationReturn<Args, Result> {
  /**
   * Execute the mutation. Returns a promise with the result.
   * Automatically tracks status, error, and data.
   * Throws on error — use try/catch or wrap with `toCallResult(() => execute(args))` for safe variant.
   */
  execute: (args: Args) => Promise<Result>

  /**
   * Result data from the last successful mutation.
   * undefined if mutation hasn't succeeded yet.
   */
  data: Ref<Result | undefined>

  /**
   * Mutation status for explicit state management.
   */
  status: ComputedRef<ConvexCallStatus>

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
export interface UseConvexMutationOptions<Args extends Record<string, unknown>, Result = unknown> {
  /**
   * Optimistic update function. Receives Convex's OptimisticLocalStore and mutation args.
   * Called immediately before the mutation is sent to server.
   * Automatically rolled back when the mutation completes and server data arrives.
   *
   * Use this to update local query results for instant UI feedback.
   *
   * @example
   * ```ts
   * const { execute } = useConvexMutation(api.notes.add, {
   *   optimisticUpdate: (localStore, args) => {
   *     // Update a regular query
   *     updateQuery({
   *       query: api.notes.list,
   *       args: {},
   *       store: localStore,
   *       updater: (current) => current ? [newNote, ...current] : [newNote]
   *     })
   *
   *     // Or update a paginated query
   *     insertAtTop({
   *       query: api.notes.listPaginated,
   *       store: localStore,
   *       item: { _id: crypto.randomUUID(), ...args }
   *     })
   *   }
   * })
   * ```
   */
  optimisticUpdate?: (localStore: OptimisticLocalStore, args: Args) => void
  /**
   * Called after a successful mutation.
   * Errors thrown here are logged and ignored.
   */
  onSuccess?: (result: Result, args: Args) => void
  /**
   * Called after a failed mutation.
   * Errors thrown here are logged and ignored.
   */
  onError?: (error: Error, args: Args) => void
}

// ============================================================================
// Shared execute state for mutations and actions
// ============================================================================

/**
 * Internal helper exported only for useConvexAction.
 */
export function createConvexCallState<Args extends Record<string, unknown>, Result>(config: {
  fnName: string
  callType: 'mutation' | 'action'
  logger: Logger
  hasOptimisticUpdate: boolean
  callFn: (args: Args) => Promise<Result>
  onSuccess?: (result: Result, args: Args) => void
  onError?: (error: Error, args: Args) => void
}): UseConvexMutationReturn<Args, Result> {
  const { fnName, callType, logger, hasOptimisticUpdate, callFn, onSuccess, onError } = config

  let activeRequestId = 0
  const _status = ref<ConvexCallStatus>('idle')
  const error = ref<Error | null>(null) as Ref<Error | null>
  const data = ref<Result | undefined>(undefined) as Ref<Result | undefined>

  const status = computed(() => _status.value)
  const pending = computed(() => _status.value === 'pending')

  const reset = () => {
    activeRequestId += 1
    _status.value = 'idle'
    error.value = null
    data.value = undefined
  }

  const execute = async (args: Args): Promise<Result> => {
    const startTime = Date.now()
    const currentRequestId = ++activeRequestId

    _status.value = 'pending'
    error.value = null

    const callId = registerDevtoolsEntry(fnName, callType, args, hasOptimisticUpdate)

    if (hasOptimisticUpdate) {
      logger.mutation({ name: fnName, event: 'optimistic', args })
    }

    try {
      const result = await callFn(args)
      if (currentRequestId === activeRequestId) {
        _status.value = 'success'
        data.value = result
      }

      try {
        onSuccess?.(result, args)
      } catch (callbackError) {
        if (import.meta.dev) {
          console.warn(`[better-convex-nuxt] ${callType} onSuccess callback threw in ${fnName}:`, callbackError)
        }
      }

      updateDevtoolsEntrySuccess(callId, startTime, result)
      const duration = Date.now() - startTime
      if (callType === 'mutation') {
        logger.mutation({ name: fnName, event: 'success', args, duration })
      } else {
        logger.action({ name: fnName, event: 'success', duration })
      }

      return result
    } catch (e) {
      const err = toConvexError(e)
      if (currentRequestId === activeRequestId) {
        _status.value = 'error'
        error.value = err
      }

      try {
        onError?.(err, args)
      } catch (callbackError) {
        if (import.meta.dev) {
          console.warn(`[better-convex-nuxt] ${callType} onError callback threw in ${fnName}:`, callbackError)
        }
      }

      updateDevtoolsEntryError(callId, startTime, err.message)
      const duration = Date.now() - startTime
      if (callType === 'mutation') {
        logger.mutation({ name: fnName, event: 'error', args, duration, error: err })
      } else {
        logger.action({ name: fnName, event: 'error', duration, error: err })
      }
      void handleUnauthorizedAuthFailure({ error: err, source: callType, functionName: fnName })

      throw err
    }
  }

  return { execute, data, status, pending, error, reset }
}

// ============================================================================
// useConvexMutation composable
// ============================================================================

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
 *   execute: createPost,
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
 * @example With optimistic update for regular queries
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 * import { updateQuery, deleteFromQuery } from '#imports'
 *
 * // Add to a list query
 * const { execute: addNote } = useConvexMutation(api.notes.add, {
 *   optimisticUpdate: (localStore, args) => {
 *     updateQuery({
 *       query: api.notes.list,
 *       args: { userId: args.userId },
 *       store: localStore,
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
 * </script>
 * ```
 */
export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  options?: UseConvexMutationOptions<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>,
): UseConvexMutationReturn<FunctionArgs<Mutation>, FunctionReturnType<Mutation>> {
  type Args = FunctionArgs<Mutation>
  type Result = FunctionReturnType<Mutation>

  const config = useRuntimeConfig()
  const logger = getSharedLogger(getLogLevel(config.public.convex ?? {}))
  const fnName = getFunctionName(mutation)
  const nuxtApp = useNuxtApp()

  return createConvexCallState<Args, Result>({
    fnName,
    callType: 'mutation',
    logger,
    hasOptimisticUpdate: !!options?.optimisticUpdate,
    callFn: (args) =>
      getRequiredConvexClient(nuxtApp).mutation(mutation, args, {
        optimisticUpdate: options?.optimisticUpdate,
      }),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  })
}
