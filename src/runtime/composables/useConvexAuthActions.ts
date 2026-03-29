import { computed, ref, type ComputedRef, type Ref } from 'vue'

import type { MutationStatus } from '../utils/types'
import { ConvexCallError, toConvexError } from '../utils/call-result'
import { wrapBetterAuthError } from '../utils/auth-errors'
import { useConvexAuthController } from './internal/useConvexAuthController'
import { useAuthRedirect } from './useAuthRedirect'

const AUTH_ACTION_REFRESH_RETRY_DELAYS_MS = [0, 100, 250] as const

export interface UseConvexAuthActionsOptions {
  /** Where to redirect after a successful auth flow. Overridden by `?redirect=` query param. */
  redirectTo?: string
}

export interface UseConvexAuthActionsReturn<T = unknown> {
  /**
   * Execute an auth action, refresh Convex auth state, then redirect.
   *
   * The wrapped function can be any Better Auth client method that returns a Promise.
   */
  execute: <R extends T = T>(fn: () => Promise<R>, options?: UseConvexAuthActionsOptions) => Promise<R>
  /** Lifecycle status for the latest auth action. */
  status: ComputedRef<MutationStatus>
  /** True while the auth action is in progress. */
  pending: ComputedRef<boolean>
  /** Result from the last successful auth action. */
  data: Ref<T | undefined>
  /** Error from the last auth action, or null. */
  error: Ref<Error | null>
  /** Reset state back to idle. Clears error and data. */
  reset: () => void
}

function extractBetterAuthError(result: unknown): unknown | null {
  if (!result || typeof result !== 'object')
    return null

  const record = result as Record<string, unknown>
  if ('error' in record && record.error != null)
    return record.error

  return null
}

function isMissingTokenRefreshError(error: unknown): boolean {
  return error instanceof Error && /without a token/i.test(error.message)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function useConvexAuthActions<T = unknown>(): UseConvexAuthActionsReturn<T> {
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
    let lastError: unknown = null

    for (const [index, delayMs] of AUTH_ACTION_REFRESH_RETRY_DELAYS_MS.entries()) {
      if (delayMs > 0) {
        await sleep(delayMs)
      }

      try {
        await auth.refreshAuth()
        return
      } catch (cause) {
        lastError = cause
        const hasRemainingAttempts = index < AUTH_ACTION_REFRESH_RETRY_DELAYS_MS.length - 1
        if (!hasRemainingAttempts || !isMissingTokenRefreshError(cause)) {
          throw cause
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Authentication refresh failed')
  }

  const execute = async <R extends T = T>(
    fn: () => Promise<R>,
    options?: UseConvexAuthActionsOptions,
  ): Promise<R> => {
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
    }
    catch (cause) {
      const wrapped = cause instanceof ConvexCallError ? cause : toConvexError(cause)
      error.value = wrapped
      _status.value = 'error'
      throw wrapped
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
