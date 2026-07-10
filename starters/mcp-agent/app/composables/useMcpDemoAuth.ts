import { signInInputSchema, signUpInputSchema } from '~~/shared/inputSchemas'

type AuthMode = 'signUp' | 'signIn'

function readValidationMessage(result: {
  success: false
  error: { issues: Array<{ message: string }> }
}) {
  return result.error.issues[0]?.message ?? 'Invalid input'
}

export function useMcpDemoAuth(args: { onSignedIn: () => Promise<void>; onSignedOut: () => void }) {
  const { user, isAuthenticated, isPending, signIn, signUp, signOut, refresh, authError } =
    useConvexAuth()

  const mode = ref<AuthMode>('signUp')
  const name = ref('Agent Owner')
  const email = ref(`mcp-owner-${Date.now()}@example.com`)
  const password = ref('password123')
  const authMessage = ref<string | null>(null)
  const authFormError = ref<string | null>(null)
  const authBusy = ref(false)

  const userEmail = computed(() => user.value?.email ?? null)
  const canSubmitAuth = computed(() => {
    const schema = mode.value === 'signIn' ? signInInputSchema : signUpInputSchema
    return schema.safeParse({
      name: name.value,
      email: email.value,
      password: password.value,
    }).success
  })
  const authSubmitLabel = computed(() => {
    if (authBusy.value) return mode.value === 'signIn' ? 'Signing in...' : 'Creating account...'
    return mode.value === 'signIn' ? 'Sign in' : 'Create account'
  })
  const passwordAutocomplete = computed(() =>
    mode.value === 'signIn' ? 'current-password' : 'new-password',
  )

  watch(mode, () => {
    authFormError.value = null
    authMessage.value = null
  })

  watch(
    isAuthenticated,
    async (authenticated) => {
      if (!authenticated) {
        args.onSignedOut()
        return
      }

      await args.onSignedIn()
    },
    { immediate: true },
  )

  async function submitAuth() {
    if (!canSubmitAuth.value) return

    authBusy.value = true
    authFormError.value = null
    authMessage.value = null
    try {
      if (mode.value === 'signUp') {
        const parsed = signUpInputSchema.safeParse({
          name: name.value,
          email: email.value,
          password: password.value,
        })
        if (!parsed.success) {
          throw new Error(readValidationMessage(parsed))
        }

        const result = await signUp.email({
          ...parsed.data,
        })
        if (result.error) throw new Error(result.error.message || 'Sign up failed')
      } else {
        const parsed = signInInputSchema.safeParse({
          email: email.value,
          password: password.value,
        })
        if (!parsed.success) {
          throw new Error(readValidationMessage(parsed))
        }

        const result = await signIn.email({
          ...parsed.data,
        })
        if (result.error) throw new Error(result.error.message || 'Sign in failed')
      }

      password.value = ''
      await refresh()
      await args.onSignedIn()
      authMessage.value = 'Signed in and app user bootstrapped'
    } catch (error) {
      authFormError.value = error instanceof Error ? error.message : 'Authentication failed'
    } finally {
      authBusy.value = false
    }
  }

  async function handleSignOut() {
    await signOut()
    args.onSignedOut()
    authMessage.value = null
    authFormError.value = null
  }

  return {
    userEmail,
    isAuthenticated,
    isPending,
    authError,
    mode,
    name,
    email,
    password,
    authMessage,
    authFormError,
    authBusy,
    canSubmitAuth,
    authSubmitLabel,
    passwordAutocomplete,
    submitAuth,
    handleSignOut,
  }
}
