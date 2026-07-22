import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from 'convex/server'
import { getCurrentScope, onScopeDispose, type Ref, type ComputedRef } from 'vue'

import { useNuxtApp } from '#imports'

import type { ConvexCallError, CallResult } from '../errors'
import { readConvexRuntimeContext } from '../runtime-context'
import { createCallableLifecycle } from '../utils/callable-lifecycle'
import { ensureConvexAuthReady } from '../utils/convex-auth-ready'
import { getFunctionName } from '../utils/convex-shared'
import { createLogger } from '../utils/logger'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
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
   * Error from the last action attempt as the normalized {@link ConvexCallError}.
   * null if no error or action hasn't been called.
   */
  error: Ref<ConvexCallError | null>

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
   * Called after a failed action with the normalized {@link ConvexCallError}.
   * Errors thrown here are logged and ignored.
   */
  onError?: (error: ConvexCallError, args: Args) => void
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

  const fnName = getFunctionName(action)

  const nuxtApp = useNuxtApp()
  const runtime = readConvexRuntimeContext(nuxtApp)
  const owner = runtime?.owner
  const coordinator = runtime?.getAuthCoordinator() ?? undefined
  const identityObserver = runtime?.getIdentityObserver()
  const logger = runtime?.logger ?? createLogger(getConvexRuntimeConfig().logging)

  // Route through the per-app client owner's stable handle , never
  // the raw replaceable `$convex` seam. A retired-generation in-flight action
  // rejects with IDENTITY_CHANGED rather than resolving under a new identity.
  const lifecycle = createCallableLifecycle<Args, Result>({
    devtoolsKind: 'action',
    fnName,
    hasOptimisticUpdate: false,
    getIdentityGeneration: () => identityObserver?.snapshot().identityGeneration ?? 0,
    getDevtoolsSink: () => runtime?.getDevtoolsSink() ?? null,
    handlers: {
      invoke: async (args) => {
        if (!owner) {
          throw new Error(
            '[useConvexAction] Convex client is unavailable. Call actions from the browser after configuring a Convex URL.',
          )
        }
        await ensureConvexAuthReady(coordinator, 'useConvexAction')
        return (await owner.handle.action(action, args as never)) as Result
      },
      onSuccess: options?.onSuccess,
      onError: options?.onError,
      logSuccess: (_args, duration) => logger.action({ name: fnName, event: 'success', duration }),
      logError: (_args, duration, error) =>
        logger.action({ name: fnName, event: 'error', duration, error }),
      logCallbackError: (error) => logger.action({ name: fnName, event: 'error', error }),
    },
  })

  // Mask retained state synchronously on identity change (architecture invariant).
  if (identityObserver && getCurrentScope()) {
    onScopeDispose(identityObserver.subscribe(() => lifecycle.onIdentityMaybeChanged()))
  }

  const execute = (...callArgs: OptionalRestArgs<Action>): Promise<Result> =>
    lifecycle.run((callArgs[0] ?? {}) as Args)

  const safe = (...callArgs: OptionalRestArgs<Action>): Promise<CallResult<Result>> =>
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
