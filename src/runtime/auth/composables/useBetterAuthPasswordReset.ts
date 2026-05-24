import { useBetterAuthActions, type UseBetterAuthActionsOptions } from './useBetterAuthActions.js'
import { useBetterAuthClient } from './useBetterAuthClient.js'

/** Subset of the Better Auth client used by password-reset flows (available when emailAndPassword is enabled). */
interface PasswordResetClient {
  forgetPassword: (args: { email: string; redirectTo: string }) => Promise<unknown>
  resetPassword: (args: { newPassword: string; token: string }) => Promise<unknown>
}

/**
 * Composable for password-reset flows via Better Auth.
 *
 * Exposes two operations that share the same status/error/data state:
 * - `forgotPassword(email)` — sends a reset-link email
 * - `resetPassword({ newPassword, token })` — confirms the reset using the
 *   token from the reset link
 *
 * Pass `{ resetPagePath }` to customize the URL in the reset-link email (default: `/reset-password`).
 *
 * @example Request step
 * ```vue
 * <script setup>
 * const { forgotPassword, pending, error } = useBetterAuthPasswordReset()
 * </script>
 *
 * <template>
 *   <form @submit.prevent="forgotPassword(email)">
 *     <input v-model="email" type="email" />
 *     <button :disabled="pending">Send reset link</button>
 *   </form>
 * </template>
 * ```
 *
 * @example Confirm step (on /reset-password?token=...)
 * ```vue
 * <script setup>
 * const route = useRoute()
 * const token = String(route.query.token ?? '')
 * const { resetPassword, pending, error } = useBetterAuthPasswordReset()
 * </script>
 *
 * <template>
 *   <form @submit.prevent="resetPassword({ newPassword, token }, { redirectTo: '/login' })">
 *     <input v-model="newPassword" type="password" />
 *     <button :disabled="pending">Set new password</button>
 *   </form>
 * </template>
 * ```
 */
export function useBetterAuthPasswordReset(options?: { resetPagePath?: string }) {
  const client = useBetterAuthClient()
  const actions = useBetterAuthActions()
  const resetPage = options?.resetPagePath ?? '/reset-password'
  // Cast to the password-reset subset — available when emailAndPassword is enabled in Better Auth
  const passwordClient = client as PasswordResetClient | null
  const forgetPassword = passwordClient?.forgetPassword
  const resetPasswordFn = passwordClient?.resetPassword

  const getUnavailableError = (operation: 'forgotPassword' | 'resetPassword') =>
    new Error(
      !passwordClient
        ? '[useBetterAuthPasswordReset] Better Auth client is not available. Ensure auth is enabled in your Trellis config.'
        : operation === 'forgotPassword'
          ? '[useBetterAuthPasswordReset] Password reset email flow is not available on the Better Auth client. Enable emailAndPassword with reset-password support in your Better Auth config.'
          : '[useBetterAuthPasswordReset] Password reset confirmation is not available on the Better Auth client. Enable emailAndPassword with reset-password support in your Better Auth config.',
    )

  // Better Auth uses "forgetPassword"; we expose "forgotPassword" for natural English
  const forgotPasswordAction = (email: string, opts?: UseBetterAuthActionsOptions) => {
    if (!forgetPassword) {
      return actions.execute(() => Promise.reject(getUnavailableError('forgotPassword')), opts)
    }
    return actions.execute(() => forgetPassword({ email, redirectTo: resetPage }), opts)
  }

  const resetPasswordAction = (
    args: { newPassword: string; token: string },
    opts?: UseBetterAuthActionsOptions,
  ) => {
    if (!resetPasswordFn) {
      return actions.execute(() => Promise.reject(getUnavailableError('resetPassword')), opts)
    }
    return actions.execute(() => resetPasswordFn(args), opts)
  }

  return {
    forgotPassword: forgotPasswordAction,
    resetPassword: resetPasswordAction,
    status: actions.status,
    pending: actions.pending,
    error: actions.error,
    data: actions.data,
    reset: actions.reset,
  }
}
