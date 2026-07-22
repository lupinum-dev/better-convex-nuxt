import { watch, type Ref } from 'vue'

import type { BrowserAuthAdapter, BrowserAuthSnapshot } from '../client-core/auth-adapter'
import { fetchConvexToken, isTokenUsable, type ConvexTokenSource } from './token-fetcher'

interface BetterAuthSessionState {
  data?: {
    session?: { token?: unknown }
    user?: { id?: unknown }
  } | null
  isPending?: boolean
  error?: unknown
}

interface BetterAuthBrowserSource extends ConvexTokenSource {
  useSession(): Readonly<Ref<BetterAuthSessionState>>
}

const UNAVAILABLE = 'Authentication is temporarily unavailable'

/** Private first-party adapter proof. It becomes a Nuxt adapter only after the atomic package cut. */
export function createBetterAuthBrowserAdapter(
  source: BetterAuthBrowserSource,
): BrowserAuthAdapter & {
  dispose(): void
} {
  const session = source.useSession()
  const listeners = new Set<() => void>()
  let disposed = false
  let sessionGeneration = 0
  let observedSessionToken: string | null | undefined
  let observedIdentityKey: string | null | undefined
  let cachedToken: string | null = null
  let snapshot: BrowserAuthSnapshot = {
    status: 'loading',
    identityKey: null,
    sessionGeneration,
    error: null,
  }

  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // Provider observers cannot affect canonical auth state.
      }
    }
  }

  const publishFromSession = (value: BetterAuthSessionState) => {
    const rawSessionToken = value.data?.session?.token
    const sessionToken =
      typeof rawSessionToken === 'string' && rawSessionToken.length > 0 ? rawSessionToken : null
    const rawUserId = value.data?.user?.id
    const userId = typeof rawUserId === 'string' && rawUserId.length > 0 ? rawUserId : null
    const key = userId

    if (value.isPending === true) {
      snapshot = { status: 'loading', identityKey: null, sessionGeneration, error: null }
      notify()
      return
    }

    const malformed =
      (value.data?.session !== undefined && sessionToken === null) ||
      (sessionToken !== null && key === null)
    if (value.error || malformed) {
      cachedToken = null
      sessionGeneration += 1
      observedSessionToken = sessionToken
      observedIdentityKey = key
      snapshot = {
        status: 'error',
        identityKey: null,
        sessionGeneration,
        error: new Error(UNAVAILABLE),
      }
      notify()
      return
    }

    const changed =
      observedSessionToken !== sessionToken ||
      observedIdentityKey !== key ||
      observedSessionToken === undefined
    if (changed) {
      sessionGeneration += 1
      cachedToken = null
    }
    observedSessionToken = sessionToken
    observedIdentityKey = key
    snapshot =
      sessionToken && key
        ? { status: 'authenticated', identityKey: key, sessionGeneration, error: null }
        : { status: 'anonymous', identityKey: null, sessionGeneration, error: null }
    notify()
  }

  const stop = watch(
    [
      () => session.value.isPending === true,
      () => session.value.data,
      () => Boolean(session.value.error),
    ] as const,
    ([isPending, data, hasError]) => publishFromSession({ isPending, data, error: hasError }),
    {
      immediate: true,
      deep: false,
      // Identity observation is a security boundary: retire the old identity
      // in the same turn rather than after Vue's render queue flushes.
      flush: 'sync',
    },
  )

  return Object.freeze({
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async fetchToken() {
      if (disposed || snapshot.status !== 'authenticated') return null
      const expectedKey = snapshot.identityKey
      const outcome = await fetchConvexToken(source)
      if (disposed || snapshot.status !== 'authenticated' || snapshot.identityKey !== expectedKey) {
        return null
      }
      if (outcome.identity) {
        const fetchedKey = outcome.identity.user.id
        if (fetchedKey !== expectedKey) {
          cachedToken = null
          return null
        }
        cachedToken = outcome.identity.token
        return cachedToken
      }
      if (!outcome.definitive && isTokenUsable(cachedToken)) return cachedToken
      cachedToken = null
      return null
    },
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      listeners.clear()
      cachedToken = null
      observedSessionToken = null
    },
  })
}
