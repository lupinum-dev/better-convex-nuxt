import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { useNuxtApp, useRuntimeConfig } from '#imports'

import { getFunctionName } from '../utils/convex-cache'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import type { ValidateOption } from '../utils/resolve-validator'
import { getRequiredConvexClient } from './useConvex'
import { createConvexCallState, type UseConvexMutationReturn } from './useConvexMutation'

/**
 * Return value from useConvexAction.
 * Identical shape to UseConvexMutationReturn (no optimisticUpdate on the output).
 */
export type UseConvexActionReturn<Args, Result> = UseConvexMutationReturn<Args, Result>

/**
 * Options for useConvexAction
 */
export interface UseConvexActionOptions<Args, Result> {
  /**
   * Pre-validate args before sending to the server.
   * Accepts a Convex validator or any Standard Schema v1 producer.
   */
  validate?: ValidateOption
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
 * Returns a callable function with reactive state properties attached.
 * The action automatically tracks its state - no manual loading refs needed.
 *
 * Note: Actions only work on the client side.
 *
 * @example Basic usage with status tracking
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
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
  type Args = FunctionArgs<Action>
  type Result = FunctionReturnType<Action>

  const config = useRuntimeConfig()
  const logger = getSharedLogger(getLogLevel(config.public.convex ?? {}))
  const fnName = getFunctionName(action)
  const nuxtApp = useNuxtApp()

  return createConvexCallState<Args, Result, 'action'>({
    fnName,
    callType: 'action',
    logger,
    nuxtApp,
    hasOptimisticUpdate: false,
    callFn: (args) => getRequiredConvexClient(nuxtApp).action(action, args),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
    validate: options?.validate,
  })
}
