import type { OptimisticLocalStore } from 'convex/browser'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from 'convex/server'
import { getCurrentScope, onScopeDispose, type Ref, type ComputedRef } from 'vue'

import { useNuxtApp, useRuntimeConfig } from '#imports'

import type { ConvexAuthCoordinator } from '../auth/client-engine'
import type { AuthIdentityPort } from '../auth/identity-port'
import type { ConvexClientOwner } from '../client/client-owner'
import type { ConvexCallError, CallResult } from '../utils/call-result'
import { createCallableLifecycle } from '../utils/callable-lifecycle'
import { ensureConvexAuthReady } from '../utils/convex-auth-ready'
import { getFunctionName } from '../utils/convex-cache'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import type { ConvexCallStatus } from '../utils/types'

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
} from './regular-optimistic-updates'

/**
 * Return value from useConvexMutation
 */
export type UseConvexMutationReturn<Mutation extends FunctionReference<'mutation'>> = ((
  ...args: OptionalRestArgs<Mutation>
) => Promise<FunctionReturnType<Mutation>>) & {
  /**
   * Execute the mutation without throwing.
   * Returns a stable result envelope.
   */
  safe: (...args: OptionalRestArgs<Mutation>) => Promise<CallResult<FunctionReturnType<Mutation>>>

  /**
   * Result data from the last successful mutation.
   * undefined if mutation hasn't succeeded yet.
   */
  data: Ref<FunctionReturnType<Mutation> | undefined>

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
   * Error from the last mutation attempt as the normalized {@link ConvexCallError}.
   * null if no error or mutation hasn't been called.
   */
  error: Ref<ConvexCallError | null>

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
   * const addNote = useConvexMutation(api.notes.add, {
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
   * Called after a failed mutation with the normalized {@link ConvexCallError}.
   * Errors thrown here are logged and ignored.
   */
  onError?: (error: ConvexCallError, args: Args) => void
}

/**
 * Composable for calling Convex mutations with automatic state tracking.
 *
 * Returns a callable mutation function with reactive status, error, and data refs
 * attached. The mutation automatically tracks its state - no manual loading refs needed.
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
 * import { api } from '#convex/api'
 *
 * const createPost = useConvexMutation(api.posts.create)
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
 *   <button :disabled="createPost.pending.value" @click="handleSubmit">
 *     {{ createPost.pending.value ? 'Creating...' : 'Create' }}
 *   </button>
 *   <p v-if="createPost.status.value === 'error'" class="error">{{ createPost.error.value?.message }}</p>
 *   <p v-if="createPost.status.value === 'success'">Created!</p>
 * </template>
 * ```
 *
 * @example Multiple mutations with individual state
 * ```vue
 * <script setup>
 * const createPost = useConvexMutation(api.posts.create)
 *
 * const deletePost = useConvexMutation(api.posts.remove)
 * </script>
 * ```
 *
 * @example With optimistic update for paginated queries
 * ```vue
 * <script setup>
 * import { api } from '#convex/api'
 * import { insertAtTop } from '#imports'
 *
 * const addNote = useConvexMutation(api.notes.add, {
 *   optimisticUpdate: (localStore, args) => {
 *     insertAtTop({
 *       query: api.notes.listPaginated,
 *       store: localStore,
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
 * import { api } from '#convex/api'
 * import { updateQuery, deleteFromQuery } from '#imports'
 *
 * // Add to a list query
 * const addNote = useConvexMutation(api.notes.add, {
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
 *
 * // Remove from a list query
 * const removeNote = useConvexMutation(api.notes.remove, {
 *   optimisticUpdate: (localStore, args) => {
 *     deleteFromQuery({
 *       query: api.notes.list,
 *       args: { userId: currentUserId.value },
 *       store: localStore,
 *       shouldDelete: (note) => note._id === args.noteId,
 *     })
 *   },
 * })
 * </script>
 * ```
 */
export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  options?: UseConvexMutationOptions<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>,
): UseConvexMutationReturn<Mutation> {
  type Args = FunctionArgs<Mutation>
  type Result = FunctionReturnType<Mutation>

  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = getSharedLogger(logLevel)
  const fnName = getFunctionName(mutation)
  const hasOptimisticUpdate = !!options?.optimisticUpdate

  const nuxtApp = useNuxtApp()
  const owner = (nuxtApp as { $convexClientOwner?: ConvexClientOwner }).$convexClientOwner
  const port = (nuxtApp as { $convexAuthPort?: AuthIdentityPort }).$convexAuthPort

  // Route through the per-app client owner's stable handle (vNext §5.4), never
  // the raw replaceable `$convex` seam: after an identity switch a captured raw
  // client would be closed/stale, and a retired-generation in-flight call must
  // reject with IDENTITY_CHANGED instead of returning under the new identity.
  const lifecycle = createCallableLifecycle<Args, Result>({
    devtoolsKind: 'mutation',
    fnName,
    hasOptimisticUpdate,
    getIdentityGeneration: () => (port ? port.snapshot().identityGeneration : 0),
    handlers: {
      invoke: async (args) => {
        if (!owner) {
          throw new Error(
            '[useConvexMutation] Convex client is unavailable. Call mutations from the browser after configuring a Convex URL.',
          )
        }
        await ensureConvexAuthReady(
          nuxtApp.$convexAuthCoordinator as ConvexAuthCoordinator | undefined,
          'useConvexMutation',
        )
        return (await owner.handle.mutation(mutation, args as never, {
          optimisticUpdate: options?.optimisticUpdate,
        })) as Result
      },
      onStart: (args) => {
        if (hasOptimisticUpdate) logger.mutation({ name: fnName, event: 'optimistic', args })
      },
      onSuccess: options?.onSuccess,
      onError: options?.onError,
      logSuccess: (args, duration) =>
        logger.mutation({ name: fnName, event: 'success', args, duration }),
      logError: (args, duration, error) =>
        logger.mutation({ name: fnName, event: 'error', args, duration, error }),
      logCallbackError: (error) => logger.mutation({ name: fnName, event: 'error', error }),
    },
  })

  // Mask retained state synchronously on identity change (internal §8, §5.4).
  if (port && getCurrentScope()) {
    onScopeDispose(port.subscribe(() => lifecycle.onIdentityMaybeChanged()))
  }

  const execute = (...callArgs: OptionalRestArgs<Mutation>): Promise<Result> =>
    lifecycle.run((callArgs[0] ?? {}) as Args)

  const safe = (...callArgs: OptionalRestArgs<Mutation>): Promise<CallResult<Result>> =>
    lifecycle.safe((callArgs[0] ?? {}) as Args)

  return Object.assign(execute, {
    safe,
    data: lifecycle.data,
    status: lifecycle.status,
    pending: lifecycle.pending,
    error: lifecycle.error,
    reset: lifecycle.reset,
  })
}
