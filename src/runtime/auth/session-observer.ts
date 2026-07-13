import { watch, type Ref } from 'vue'

interface PublicSessionState {
  data?: { session?: { id?: unknown } } | null
  isPending?: boolean
  error?: { message?: unknown } | null
}

interface PublicSessionClient {
  useSession(): Readonly<Ref<PublicSessionState>>
}

/** Observe only Better Auth's public Vue session contract. */
export function observeBetterAuthSession(
  client: PublicSessionClient,
  reconcile: (present: boolean, errorMessage: string | null) => void,
): () => void {
  const session = client.useSession()
  return watch(
    () => {
      const value = session.value
      return {
        pending: value.isPending === true,
        sessionId: typeof value.data?.session?.id === 'string' ? value.data.session.id : null,
        error: value.error && typeof value.error.message === 'string' ? value.error.message : null,
      }
    },
    (value) => {
      if (!value.pending) reconcile(Boolean(value.sessionId), value.error)
    },
    { immediate: true },
  )
}
