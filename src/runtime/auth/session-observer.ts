import { watch, type Ref } from 'vue'

interface PublicSessionState {
  data?: { session?: { token?: unknown } } | null
  isPending?: boolean
  error?: { message?: unknown } | null
}

interface PublicSessionClient {
  useSession(): Readonly<Ref<PublicSessionState>>
}

/** Observe only Better Auth's public Vue session contract. */
export function observeBetterAuthSession(
  client: PublicSessionClient,
  reconcile: (sessionToken: string | null, errorMessage: string | null) => void,
): () => void {
  const session = client.useSession()
  return watch(
    [
      () => session.value.isPending === true,
      // Better Auth preserves this reference for JSON-equal refetches and
      // replaces it for real same-session user/session claim changes.
      () => session.value.data,
      () =>
        session.value.error && typeof session.value.error.message === 'string'
          ? session.value.error.message
          : null,
    ] as const,
    ([pending, data, error]) => {
      if (pending) return
      const rawToken = data?.session?.token
      const sessionToken = typeof rawToken === 'string' && rawToken.length > 0 ? rawToken : null
      const malformedSessionError =
        data?.session && sessionToken === null
          ? 'Better Auth session is missing its stable session token'
          : null
      reconcile(sessionToken, error ?? malformedSessionError)
    },
    { immediate: true },
  )
}
