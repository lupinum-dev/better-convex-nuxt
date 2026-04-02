import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { Ref, ComputedRef } from 'vue'
import type { ValidateOption } from '../utils/resolve-validator'
import type { MutationStatus } from '../utils/types'
import type { OptimisticContext } from './optimistic-updates'
import { useConvexMutation as useRuntimeConvexMutation } from './internal/command-runtime'

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
export interface UseConvexMutationOptions<Args, Result> {
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
  /**
   * Pre-validate args before sending to the server.
   * Accepts a Convex validator or any Standard Schema v1 producer (Zod, Valibot, ArkType).
   * On failure: error is set instantly with `category: 'validation'` and `issues` array,
   * no network request is made.
   *
   * @example
   * ```ts
   * const createPost = useConvexMutation(api.posts.create, {
   *   validate: v.object({ title: v.string(), body: v.string() }),
   * })
   * ```
   */
  validate?: ValidateOption
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
 * import { api } from '#trellis/api'
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
 * import { api } from '#trellis/api'
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
  return useRuntimeConvexMutation(mutation, options)
}
