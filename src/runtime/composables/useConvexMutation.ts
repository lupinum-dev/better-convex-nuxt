import type { OptimisticLocalStore } from 'convex/browser'
import { createOptimisticContext } from './optimistic-updates'
import type { OptimisticContext } from './optimistic-updates'
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
import type { MutationStatus } from '../utils/types'
import { getRequiredConvexClient } from './useConvex'

// Re-export optimistic update builder types
export {
  type OptimisticContext,
  type OptimisticQueryHandle,
  type OptimisticPaginatedHandle,
} from './optimistic-updates'

/**
 * Return value from useConvexMutation / useConvexAction.
 *
 * Callable directly as a function, with reactive state properties attached:
 * ```ts
 * const createPost = useConvexMutation(api.posts.create)
 * await createPost({ title: 'Hello' })  // callable directly
 * createPost.pending.value              // state access
 * createPost.error.value                // error access
 * ```
 */
export type UseConvexMutationReturn<Args, Result> = ((args: Args) => Promise<Result>) & {
  /** Result data from the last successful call. */
  data: Ref<Result | undefined>
  /** Call status: 'idle' | 'pending' | 'success' | 'error' */
  status: ComputedRef<MutationStatus>
  /** True when call is in progress. */
  pending: ComputedRef<boolean>
  /** Error from the last call attempt, or null. */
  error: Ref<Error | null>
  /** Reset state back to idle. Clears error and data. */
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
   */
  /**
   * Optimistic update callback. Receives a typed context (`ctx`) and mutation args.
   * Called immediately before the mutation is sent to the server.
   * Automatically rolled back when the server response arrives.
   *
   * @example
   * ```ts
   * const addNote = useConvexMutation(api.notes.add, {
   *   optimisticUpdate: (ctx, args) => {
   *     // Update a regular query
   *     ctx.query(api.notes.list, {}).update(notes => [...notes, { ...args, _id: 'temp' }])
   *
   *     // Update a paginated query
   *     ctx.paginatedQuery(api.notes.listPaginated, {}).insertAtTop({ ...args, _id: 'temp' })
   *   }
   * })
   * ```
   */
  optimisticUpdate?: (ctx: OptimisticContext, args: Args) => void
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
  const _status = ref<MutationStatus>('idle')
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

  // Return a callable function with state properties attached
  const callable = ((args: Args) => execute(args)) as UseConvexMutationReturn<Args, Result>
  callable.data = data
  callable.status = status
  callable.pending = pending
  callable.error = error
  callable.reset = reset
  return callable
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
 * const createPost = useConvexMutation(api.posts.create)
 *
 * async function handleSubmit() {
 *   try {
 *     await createPost({ title: 'Hello' })
 *   } catch {
 *     // error is automatically tracked via createPost.error
 *   }
 * }
 * </script>
 *
 * <template>
 *   <button :disabled="createPost.pending.value" @click="handleSubmit">
 *     {{ createPost.pending.value ? 'Creating...' : 'Create' }}
 *   </button>
 *   <p v-if="createPost.status.value === 'error'" class="error">{{ createPost.error.value?.message }}</p>
 *   <p v-if="createPost.status.value === 'success'">Created!</p>
 * </template>
 * ```
 *
 * @example With optimistic update
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const addNote = useConvexMutation(api.notes.add, {
 *   optimisticUpdate: (ctx, args) => {
 *     ctx.query(api.notes.list, { userId: args.userId }).update(current => {
 *       const newNote = {
 *         _id: crypto.randomUUID() as Id<'notes'>,
 *         _creationTime: Date.now(),
 *         ...args,
 *       }
 *       return current ? [newNote, ...current] : [newNote]
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
        optimisticUpdate: options?.optimisticUpdate
          ? (store: OptimisticLocalStore, mutArgs: Args) =>
              options.optimisticUpdate!(createOptimisticContext(store), mutArgs)
          : undefined,
      }),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  })
}
