import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { ConvexCallError, toConvexError } from '../../utils/call-result.js'
import type { MutationStatus } from '../../utils/types.js'
import { useConvexAuthController } from '../internal/useConvexAuthController.js'
import { wrapBetterAuthError } from '../shared/auth-errors.js'
import { useAuthRedirect } from './useAuthRedirect.js'

export interface UseBetterAuthActionsOptions {
  /** Where to redirect after a successful auth flow. Overridden by `?redirect=` query param. */
  redirectTo?: string
}

export interface UseBetterAuthActionsReturn<T = unknown> {
  /**
   * Execute an auth action, refresh Convex auth state, then redirect.
   *
   * The wrapped function can be any Better Auth client method that returns a Promise.
   * Returns `undefined` if the action fails — check `error.value` for the error.
   */
  execute: <R extends T = T>(
    fn: () => Promise<R>,
    options?: UseBetterAuthActionsOptions,
  ) => Promise<R | undefined>
  /** Lifecycle status for the latest auth action. */
  status: ComputedRef<MutationStatus>
  /** True while the auth action is in progress. */
  pending: ComputedRef<boolean>
  /** Result from the last successful auth action. */
  data: Readonly<Ref<T | undefined>>
  /** Error from the last auth action, or null. */
  error: Readonly<Ref<Error | null>>
  /** Reset state back to idle. Clears error and data. */
  reset: () => void
}

function extractBetterAuthError(result: unknown): unknown | null {
  if (!result || typeof result !== 'object') return null

  const record = result as Record<string, unknown>
  if ('error' in record && record.error != null) return record.error

  return null
}

export function useBetterAuthActions<T = unknown>(): UseBetterAuthActionsReturn<T> {
  const auth = useConvexAuthController()
  const { redirectAfterAuth } = useAuthRedirect()

  const _status = ref<MutationStatus>('idle')
  const error = ref<Error | null>(null)
  const data = ref<T | undefined>(undefined) as Ref<T | undefined>

  const status = computed(() => _status.value)
  const pending = computed(() => _status.value === 'pending')

  const reset = () => {
    _status.value = 'idle'
    error.value = null
    data.value = undefined
  }

  const refreshAuthAfterAction = async (): Promise<void> => {
    await auth.refreshAuth({ trigger: 'auth-action' })
  }

  const execute = async <R extends T = T>(
    fn: () => Promise<R>,
    options?: UseBetterAuthActionsOptions,
  ): Promise<R | undefined> => {
    _status.value = 'pending'
    error.value = null
    data.value = undefined

    try {
      const result = await fn()
      const betterAuthError = extractBetterAuthError(result)
      if (betterAuthError) {
        throw wrapBetterAuthError(betterAuthError, 'auth')
      }

      await refreshAuthAfterAction()
      data.value = result as T
      _status.value = 'success'
      await redirectAfterAuth(options?.redirectTo)
      return result
    } catch (cause) {
      const wrapped = cause instanceof ConvexCallError ? cause : toConvexError(cause)
      error.value = wrapped
      _status.value = 'error'
      return undefined
    }
  }

  return {
    execute,
    status,
    pending,
    data,
    error,
    reset,
  }
}
