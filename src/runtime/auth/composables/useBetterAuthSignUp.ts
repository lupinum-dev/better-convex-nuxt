import { useBetterAuthActions, type UseBetterAuthActionsOptions } from './useBetterAuthActions.js'
import { useBetterAuthClient } from './useBetterAuthClient.js'

/**
 * Composable for email/password sign-up via Better Auth.
 *
 * Pre-wires `authClient.signUp.email()` through `useBetterAuthActions`,
 * so Convex auth state is refreshed and the user is redirected automatically
 * after a successful sign-up.
 *
 * @example
 * ```vue
 * <script setup>
 * const { signUp, pending, error } = useBetterAuthSignUp()
 * </script>
 *
 * <template>
 *   <form @submit.prevent="signUp({ email, password, name }, { redirectTo: '/dashboard' })">
 *     <input v-model="name" type="text" />
 *     <input v-model="email" type="email" />
 *     <input v-model="password" type="password" />
 *     <button :disabled="pending">Create account</button>
 *     <p v-if="error">{{ error.message }}</p>
 *   </form>
 * </template>
 * ```
 */
export function useBetterAuthSignUp() {
  const client = useBetterAuthClient()
  const actions = useBetterAuthActions()
  const signUpEmail = client?.signUp?.email

  const getUnavailableError = () =>
    new Error(
      !client
        ? '[useBetterAuthSignUp] Better Auth client is not available. Ensure auth is enabled in your Trellis config.'
        : '[useBetterAuthSignUp] Email/password sign-up is not available on the Better Auth client. Enable emailAndPassword in your Better Auth config or use a supported auth flow.',
    )

  const signUp = (
    credentials: { email: string; password: string; name: string },
    opts?: UseBetterAuthActionsOptions,
  ) => {
    if (!signUpEmail) {
      return actions.execute(() => Promise.reject(getUnavailableError()), opts)
    }
    return actions.execute(() => signUpEmail(credentials), opts)
  }

  return {
    signUp,
    status: actions.status,
    pending: actions.pending,
    error: actions.error,
    data: actions.data,
    reset: actions.reset,
  }
}
