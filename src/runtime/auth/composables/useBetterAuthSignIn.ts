import { useBetterAuthActions, type UseBetterAuthActionsOptions } from './useBetterAuthActions.js'
import { useBetterAuthClient } from './useBetterAuthClient.js'

/**
 * Composable for email/password sign-in via Better Auth.
 *
 * Pre-wires `authClient.signIn.email()` through `useBetterAuthActions`,
 * so Convex auth state is refreshed and the user is redirected automatically
 * after a successful sign-in.
 *
 * @example
 * ```vue
 * <script setup>
 * const { signIn, pending, error } = useBetterAuthSignIn()
 * </script>
 *
 * <template>
 *   <form @submit.prevent="signIn({ email, password }, { redirectTo: '/dashboard' })">
 *     <input v-model="email" type="email" />
 *     <input v-model="password" type="password" />
 *     <button :disabled="pending">Sign in</button>
 *     <p v-if="error">{{ error.message }}</p>
 *   </form>
 * </template>
 * ```
 */
export function useBetterAuthSignIn() {
  const client = useBetterAuthClient()
  const actions = useBetterAuthActions()
  const signInEmail = client?.signIn?.email

  const getUnavailableError = () =>
    new Error(
      !client
        ? '[useBetterAuthSignIn] Better Auth client is not available. Ensure auth is enabled in your Trellis config.'
        : '[useBetterAuthSignIn] Email/password sign-in is not available on the Better Auth client. Enable emailAndPassword in your Better Auth config or use a supported auth flow.',
    )

  const signIn = (
    credentials: { email: string; password: string },
    opts?: UseBetterAuthActionsOptions,
  ) => {
    if (!signInEmail) {
      return actions.execute(() => Promise.reject(getUnavailableError()), opts)
    }
    return actions.execute(() => signInEmail(credentials), opts)
  }

  return {
    signIn,
    status: actions.status,
    pending: actions.pending,
    error: actions.error,
    data: actions.data,
    reset: actions.reset,
  }
}
