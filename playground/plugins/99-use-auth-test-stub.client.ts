export default defineNuxtPlugin({
  name: 'use-auth-test-stub',
  enforce: 'pre',
  setup(nuxtApp) {
    const url = new URL(window.location.href)
    if (url.searchParams.get('__stubAuth') !== '1') return

    const makeResult = (kind: 'signIn' | 'signUp', payload: Record<string, unknown>) => ({
      data: {
        ok: true,
        kind,
        payload,
      },
      error: null,
    })

    const fakeAuthClient = {
      signIn: {
        email: async (payload: Record<string, unknown>) => makeResult('signIn', payload),
        social: async (payload: Record<string, unknown>) => makeResult('signIn', payload),
      },
      signUp: {
        email: async (payload: Record<string, unknown>) => makeResult('signUp', payload),
      },
      signOut: async () => ({ data: { success: true }, error: null }),
    }

    ;(nuxtApp as typeof nuxtApp & { $auth?: unknown }).$auth = fakeAuthClient
  },
})

