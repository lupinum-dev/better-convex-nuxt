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

/**
 * Action status representing the current state of the action
 * - 'idle': not yet called or reset
 * - 'pending': action in progress
 * - 'success': action completed successfully
 * - 'error': action failed
 */
export type ActionStatus = 'idle' | 'pending' | 'success' | 'error'

/**
 * Return value from useConvexAction
 */
export interface UseConvexActionReturn<Args, Result> {
  /**
   * Execute the action. Returns a promise with the result.
   * Automatically tracks status, error, and data.
   * Throws on error (use try/catch or check error ref after).
   */
  execute: (args: Args) => Promise<Result>

  /**
   * Result data from the last successful action.
   * undefined if action hasn't succeeded yet.
   */
  data: Ref<Result | undefined>

  /**
   * Action status for explicit state management.
   */
  status: ComputedRef<ActionStatus>

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
): UseConvexActionReturn<FunctionArgs<Action>, FunctionReturnType<Action>> {
  type Args = FunctionArgs<Action>
  type Result = FunctionReturnType<Action>

  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = createLogger(logLevel)
  const fnName = getFunctionName(action)

  // Internal state
  const _status = ref<ActionStatus>('idle')
  const error = ref<Error | null>(null) as Ref<Error | null>
  const data = ref<Result | undefined>(undefined) as Ref<Result | undefined>

  // Computed - matches useConvexMutation pattern
  const status = computed(() => _status.value)
  const pending = computed(() => _status.value === 'pending')

  // Reset function
  const reset = () => {
    _status.value = 'idle'
    error.value = null
    data.value = undefined
  }

  // The execute function
  const execute = async (args: Args): Promise<Result> => {
    const client = useConvex()
    const startTime = Date.now()

    if (!client) {
      const err = new Error('ConvexClient not available - actions only work on client side')
      _status.value = 'error'
      error.value = err
      logger.action({ name: fnName, event: 'error', error: err })
      throw err
    }

    _status.value = 'pending'
    error.value = null

    // Register with DevTools
    const actionId = registerDevToolsEntry(fnName, 'action', args, false)

    try {
      const result = await client.action(action, args)
      _status.value = 'success'
      data.value = result

      // Update DevTools
      updateDevToolsSuccess(actionId, startTime, result)

      const duration = Date.now() - startTime
      logger.action({ name: fnName, event: 'success', duration })

      return result
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      _status.value = 'error'
      error.value = err

      // Update DevTools
      updateDevToolsError(actionId, startTime, err.message)

      const duration = Date.now() - startTime
      logger.action({ name: fnName, event: 'error', duration, error: err })

      throw err
    }
  }

  return {
    execute,
    data,
    status,
    pending,
    error,
    reset,
  }
}
