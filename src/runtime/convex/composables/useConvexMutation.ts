import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { useConvexMutation as useRuntimeConvexMutation } from '../shared/command-runtime.js'
import type { UseConvexMutationOptions, UseConvexMutationReturn } from '../shared/command-types.js'

// Re-export optimistic update builder types
export {
  type OptimisticContext,
  type OptimisticQueryHandle,
  type OptimisticPaginatedHandle,
} from './optimistic-updates.js'

export type { UseConvexMutationOptions, UseConvexMutationReturn }

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
