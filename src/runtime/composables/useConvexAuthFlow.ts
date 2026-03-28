import { ref, type Ref } from 'vue'

import { useNuxtApp } from '#imports'

import { ConvexCallError, toConvexError } from '../utils/call-result'
import { wrapBetterAuthError } from '../utils/auth-errors'
import { useConvexAuthInternal } from './useConvexAuthInternal'
import { useAuthRedirect } from './useAuthRedirect'

export interface UseConvexAuthFlowOptions {
  /** Where to redirect after a successful auth flow. Overridden by `?redirect=` query param. */
  redirectTo?: string
}

export interface UseConvexAuthFlowReturn {
  /**
   * Execute an auth flow: call the provided function, refresh the Convex JWT,
   * then redirect to the post-auth destination.
   *
   * The function can be any Better Auth method (signIn, signUp, resetPassword, etc.).
   * If it returns Better Auth's `{ data, error }` shape and `error` is non-null,
   * the error is wrapped and thrown automatically.
   *
   * @example
   * ```ts
   * const { execute, pending, error } = useConvexAuthFlow()
   *
   * // Sign in
   * await execute(
   *   () => auth.signIn.email({ email, password }),
   *   { redirectTo: '/dashboard' },
   * )
   *
   * // Sign up
   * await execute(
   *   () => auth.signUp.email({ name, email, password }),
   *   { redirectTo: '/onboarding' },
   * )
   * ```
   */
  execute: <T>(fn: () => Promise<T>, options?: UseConvexAuthFlowOptions) => Promise<T>
  /** True while the auth flow is in progress. */
  pending: Ref<boolean>
  /** Error from the last auth flow attempt, or null. */
  error: Ref<ConvexCallError | null>
}

/**
 * Detect Better Auth's `{ data, error }` response pattern.
 * Returns the error value if present, null otherwise.
 */
function extractBetterAuthError(result: unknown): unknown | null {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, unknown>
  // Better Auth always returns { data, error } — error is null on success
  if ('error' in record && record.error != null) return record.error
  return null
}

/**
 * Composable that wraps any Better Auth flow with Convex token refresh and redirect.
 *
 * Does not know or care which auth method is being called — it only handles the
 * orchestration: call → detect error → refreshAuth → redirect.
 *
 * Social auth (`auth.signIn.social()`) triggers a full-page redirect and should
 * be called directly without this composable.
 *
 * @example
 * ```ts
 * const { execute, pending, error } = useConvexAuthFlow()
 *
 * async function handleSubmit() {
 *   await execute(
 *     () => auth.signIn.email({ email: form.email, password: form.password }),
 *     { redirectTo: '/dashboard' },
 *   )
 * }
 * ```
 */
export function useConvexAuthFlow(): UseConvexAuthFlowReturn {
  const { refreshAuth } = useConvexAuthInternal()
  const { redirectAfterAuth } = useAuthRedirect()

  const pending = ref(false)
  const error = ref<ConvexCallError | null>(null) as Ref<ConvexCallError | null>

  const execute = async <T>(
    fn: () => Promise<T>,
    options?: UseConvexAuthFlowOptions,
  ): Promise<T> => {
    pending.value = true
    error.value = null

    try {
      // 1. Call the user's auth function
      const result = await fn()

      // 2. Detect Better Auth's { data, error } pattern
      const betterAuthError = extractBetterAuthError(result)
      if (betterAuthError) {
        throw wrapBetterAuthError(betterAuthError, 'auth')
      }

      // 3. Refresh Convex JWT to sync auth state
      await refreshAuth()

      // 4. Redirect to post-auth destination
      redirectAfterAuth(options?.redirectTo)

      return result
    } catch (e) {
      const wrapped = e instanceof ConvexCallError ? e : toConvexError(e)
      error.value = wrapped
      throw wrapped
    } finally {
      pending.value = false
    }
  }

  return { execute, pending, error }
}
