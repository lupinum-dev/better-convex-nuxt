import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { useRuntimeConfig } from '#imports'

import { getFunctionName } from '../utils/convex-cache'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import { useConvex } from './useConvex'
import { createConvexCallState, type UseConvexMutationReturn } from './useConvexMutation'
import type { CallResult } from '../utils/call-result'

/**
 * Return value from useConvexAction.
 * Identical shape to UseConvexMutationReturn (no optimisticUpdate on the output).
 */
export type UseConvexActionReturn<Args, Result> = UseConvexMutationReturn<Args, Result>

// Re-export so callers don't need a separate import
export type { CallResult }

/**
 * Options for useConvexAction
 */
export interface UseConvexActionOptions<Args, Result> {
  /**
   * Called after a successful action.
   * Errors thrown here are logged and ignored.
   */
  onSuccess?: (result: Result, args: Args) => void
  /**
   * Called after a failed action.
   * Errors thrown here are logged and ignored.
   */
  onError?: (error: Error, args: Args) => void
}

/**
 * Composable for calling Convex actions with automatic state tracking.
 *
 * Actions can call third-party APIs, run longer computations, and perform
 * side effects that aren't possible in queries or mutations.
 *
 * Returns an execute function along with reactive status, error, and data refs.
 * The action automatically tracks its state - no manual loading refs needed.
 *
 * API designed to match useConvexMutation for consistency:
 * - `data` - result from last successful call
 * - `status` - 'idle' | 'pending' | 'success' | 'error'
 * - `pending` - boolean shorthand for status === 'pending'
 * - `error` - Error | null
 *
 * Note: Actions only work on the client side.
 *
 * @example Basic usage with status tracking
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const {
 *   execute: sendEmail,
 *   pending,
 *   status,
 *   error,
 * } = useConvexAction(api.emails.send)
 *
 * async function handleSend() {
 *   try {
 *     await sendEmail({ to: 'user@example.com', subject: 'Hello' })
 *   } catch {
 *     // error is automatically tracked
 *   }
 * }
 * </script>
 *
 * <template>
 *   <button :disabled="pending" @click="handleSend">
 *     {{ pending ? 'Sending...' : 'Send' }}
 *   </button>
 *   <p v-if="status === 'error'" class="error">{{ error?.message }}</p>
 *   <p v-if="status === 'success'">Sent!</p>
 * </template>
 * ```
 */
export function useConvexAction<Action extends FunctionReference<'action'>>(
  action: Action,
  options?: UseConvexActionOptions<FunctionArgs<Action>, FunctionReturnType<Action>>,
): UseConvexActionReturn<FunctionArgs<Action>, FunctionReturnType<Action>> {
  type Args = FunctionArgs<Action>
  type Result = FunctionReturnType<Action>

  const config = useRuntimeConfig()
  const logger = getSharedLogger(getLogLevel(config.public.convex ?? {}))
  const fnName = getFunctionName(action)
  const client = useConvex()

  return createConvexCallState<Args, Result>({
    fnName,
    callType: 'action',
    logger,
    hasOptimisticUpdate: false,
    callFn: (args) => client.action(action, args),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  })
}
