import { watch, type Ref } from 'vue'

interface PublicSessionState {
  data?: { session?: { token?: unknown } } | null
  isPending?: boolean
  error?: unknown
}

interface PublicSessionClient {
  useSession(): Readonly<Ref<PublicSessionState>>
}

const SESSION_OBSERVER_FAILURE_MESSAGE = 'Authentication is temporarily unavailable'

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
      () => Boolean(session.value.error),
    ] as const,
    ([pending, data, hasError]) => {
      if (pending) return
      const rawToken = data?.session?.token
      const sessionToken = typeof rawToken === 'string' && rawToken.length > 0 ? rawToken : null
      const malformedSessionError =
        data?.session && sessionToken === null ? SESSION_OBSERVER_FAILURE_MESSAGE : null
      reconcile(sessionToken, hasError ? SESSION_OBSERVER_FAILURE_MESSAGE : malformedSessionError)
    },
    { immediate: true },
  )
}
