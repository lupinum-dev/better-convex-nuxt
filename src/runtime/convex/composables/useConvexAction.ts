import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { useConvexAction as useRuntimeConvexAction } from '../shared/command-runtime.js'
import type { UseConvexActionOptions, UseConvexActionReturn } from '../shared/command-types.js'

export type { UseConvexActionOptions, UseConvexActionReturn }

/**
 * Composable for calling Convex actions with automatic state tracking.
 *
 * Actions can call third-party APIs, run longer computations, and perform
 * side effects that aren't possible in queries or mutations.
 *
 * Returns a callable function with reactive state properties attached.
 * The action automatically tracks its state - no manual loading refs needed.
 *
 * Note: Actions only work on the client side.
 *
 * @example Basic usage with status tracking
 * ```vue
 * <script setup>
 * import { api } from '#trellis/api'
 *
 * const sendEmail = useConvexAction(api.emails.send)
 *
 * async function handleSend() {
 *   try {
 *     await sendEmail({ to: 'user@example.com', subject: 'Hello' })
 *   } catch {
 *     // error is automatically tracked via sendEmail.error
 *   }
 * }
 * </script>
 *
 * <template>
 *   <button :disabled="sendEmail.pending.value" @click="handleSend">
 *     {{ sendEmail.pending.value ? 'Sending...' : 'Send' }}
 *   </button>
 *   <p v-if="sendEmail.status.value === 'error'" class="error">{{ sendEmail.error.value?.message }}</p>
 *   <p v-if="sendEmail.status.value === 'success'">Sent!</p>
 * </template>
 * ```
 */
export function useConvexAction<Action extends FunctionReference<'action'>>(
  action: Action,
  options?: UseConvexActionOptions<FunctionArgs<Action>, FunctionReturnType<Action>>,
): UseConvexActionReturn<FunctionArgs<Action>, FunctionReturnType<Action>> {
  return useRuntimeConvexAction(action, options)
}
