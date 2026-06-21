import type { ConvexClient } from 'convex/browser'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from 'convex/server'
import type { Ref, ComputedRef } from 'vue'

import { useNuxtApp, useRuntimeConfig } from '#imports'

import { handleUnauthorizedAuthFailure } from '../utils/auth-unauthorized'
import { normalizeConvexError, toCallResult, toError, type CallResult } from '../utils/call-result'
import { createConvexCallState } from '../utils/call-state'
import { getFunctionName } from '../utils/convex-cache'
import {
  registerDevToolsEntry,
  updateDevToolsSuccess,
  updateDevToolsError,
} from '../utils/devtools-helpers'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import type { ConvexCallStatus } from '../utils/types'

/**
 * Return value from useConvexAction
 */
export type UseConvexActionReturn<Action extends FunctionReference<'action'>> = ((
  ...args: OptionalRestArgs<Action>
) => Promise<FunctionReturnType<Action>>) & {
  /**
   * Execute the action without throwing.
   * Returns a stable result envelope.
   */
  safe: (...args: OptionalRestArgs<Action>) => Promise<CallResult<FunctionReturnType<Action>>>

  /**
   * Result data from the last successful action.
   * undefined if action hasn't succeeded yet.
   */
  data: Ref<FunctionReturnType<Action> | undefined>

  /**
   * Action status for explicit state management.
   */
  status: ComputedRef<ConvexCallStatus>

  /**
   * Shorthand for status === 'pending'.
   * True when action is in progress.
   */
  pending: ComputedRef<boolean>

  /**
   * Shorthand for error state.
   * Error from the last action attempt.
   * null if no error or action hasn't been called.
   */
  error: Ref<Error | null>

  /**
   * Reset action state back to idle.
   * Clears error and data.
   */
  reset: () => void
}

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
 * Returns a callable action function with reactive status, error, and data refs
 * attached. The action automatically tracks its state - no manual loading refs needed.
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
 * import { api } from '#convex/api'
 *
 * const sendEmail = useConvexAction(api.emails.send)
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
): UseConvexActionReturn<Action> {
  type Args = FunctionArgs<Action>
  type Result = FunctionReturnType<Action>

  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = getSharedLogger(logLevel)
  const fnName = getFunctionName(action)

  const nuxtApp = useNuxtApp()
  const callState = createConvexCallState<Result>()

  // The execute function
  const execute = async (...callArgs: OptionalRestArgs<Action>): Promise<Result> => {
    const args = (callArgs[0] ?? {}) as Args
    const startTime = Date.now()
    const currentRequestId = callState.start()

    // Register with DevTools
    const actionId = registerDevToolsEntry(fnName, 'action', args, false)

    try {
      const client = nuxtApp.$convex as ConvexClient | undefined
      if (!client) {
        throw new Error(
          '[useConvexAction] Convex client is unavailable. Call actions from the browser after configuring a Convex URL.',
        )
      }

      const result = await client.action(action, args)
      callState.commitSuccess(currentRequestId, result)

      try {
        options?.onSuccess?.(result, args)
      } catch (callbackError) {
        logger.action({
          name: fnName,
          event: 'error',
          error: callbackError instanceof Error ? callbackError : new Error(String(callbackError)),
        })
      }

      // Update DevTools
      updateDevToolsSuccess(actionId, startTime, result)

      const duration = Date.now() - startTime
      logger.action({ name: fnName, event: 'success', duration })

      return result
    } catch (e) {
      const normalized = normalizeConvexError(e)
      const err = toError(normalized)
      callState.commitError(currentRequestId, err)

      try {
        options?.onError?.(err, args)
      } catch (callbackError) {
        logger.action({
          name: fnName,
          event: 'error',
          error: callbackError instanceof Error ? callbackError : new Error(String(callbackError)),
        })
      }

      // Update DevTools
      updateDevToolsError(actionId, startTime, err.message)

      const duration = Date.now() - startTime
      logger.action({ name: fnName, event: 'error', duration, error: err })
      void handleUnauthorizedAuthFailure({ error: err, source: 'action', functionName: fnName })

      throw err
    }
  }

  const safe = async (...callArgs: OptionalRestArgs<Action>): Promise<CallResult<Result>> => {
    return await toCallResult(() => execute(...callArgs))
  }

  return Object.assign(execute, {
    safe,
    data: callState.data,
    status: callState.status,
    pending: callState.pending,
    error: callState.error,
    reset: callState.reset,
  })
}
