/**
 * Client-side Convex plugin with SSR token hydration.
 * Manually wires up setAuth() for zero-flash auth on first render.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, useRouter } from '#app'
import { watch } from 'vue'
import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import { ConvexClient } from 'convex/browser'
import { createLogger, getLogLevel } from './utils/logger'
import { matchesSkipRoute } from './utils/route-matcher'
import { decodeUserFromJwt } from './utils/convex-shared'
import type { AuthWaterfall } from './devtools/types'

interface TokenResponse {
  data?: { token: string } | null
  error?: unknown
}

type AuthClientWithConvex = ReturnType<typeof createAuthClient> & {
  convex: { token: () => Promise<TokenResponse> }
}

declare module '#app' {
  interface NuxtApp {
    _convexInitialized?: boolean
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = createLogger(logLevel)
  const endInit = logger.time('plugin:init (client)')

  // HMR-safe initialization
  if (nuxtApp._convexInitialized) return
  nuxtApp._convexInitialized = true

  const convexUrl = config.public.convex?.url as string | undefined
  // Only use siteUrl if explicitly configured - don't auto-derive
  // Users must explicitly set siteUrl to enable auth
  const siteUrl = config.public.convex?.siteUrl as string | undefined

  if (!convexUrl) {
    logger.auth({ phase: 'init', outcome: 'error', error: new Error('No Convex URL configured') })
    endInit()
    return
  }

  // SSR-hydrated auth state
  const convexToken = useState<string | null>('convex:token')
  const convexUser = useState<unknown>('convex:user')
  const convexAuthWaterfall = useState<AuthWaterfall | null>('convex:authWaterfall')
  const convexAuthError = useState<string | null>('convex:authError')

  // Create Convex WebSocket client
  const client = new ConvexClient(convexUrl)
  let authClient: AuthClientWithConvex | null = null

  // Pending state for auth operations (exposed via useConvexAuth)
  const convexPending = useState('convex:pending', () => false)

  if (siteUrl) {
    const authBaseURL =
      typeof window !== 'undefined' ? `${window.location.origin}/api/auth` : '/api/auth'

    authClient = createAuthClient({
      baseURL: authBaseURL,
      plugins: [convexClient()],
      fetchOptions: { credentials: 'include' },
    }) as AuthClientWithConvex

    // Token cache to avoid redundant fetches
    let lastTokenValidation = Date.now()
    let lastNullTokenCheck = 0
    const TOKEN_CACHE_MS = 10000
    const NULL_TOKEN_CACHE_MS = 5000 // Cache "not logged in" state to avoid duplicate 401s
    const skipRoutes = (config.public.convex?.skipAuthRoutes as string[]) || []
    const router = useRouter()

    // Cancellation controller for session sync operations
    let currentAuthOperation: AbortController | null = null

    const fetchToken = async ({
      forceRefreshToken,
      signal,
    }: {
      forceRefreshToken: boolean
      signal?: AbortSignal
    }) => {
      // Check if operation was cancelled before starting
      if (signal?.aborted) return null

      // Get current route from router (works in async callbacks)
      const route = router.currentRoute.value

      // Layer 3: Page-level skip via definePageMeta({ skipConvexAuth: true })
      if (route.meta?.skipConvexAuth === true) {
        return null
      }

      // Layer 2: Config-based route skip (skipAuthRoutes in nuxt.config)
      if (matchesSkipRoute(route.path, skipRoutes)) {
        return null
      }

      // Use SSR-hydrated token if available
      if (convexToken.value && !forceRefreshToken) {
        lastTokenValidation = Date.now()
        return convexToken.value
      }

      // Use cached token if recently validated
      const timeSinceValidation = Date.now() - lastTokenValidation
      if (convexToken.value && forceRefreshToken && timeSinceValidation < TOKEN_CACHE_MS) {
        return convexToken.value
      }

      // Layer 1: SSR detection - trust hydration in SSR mode
      // If server rendered and no token/user, server would have hydrated if user was logged in
      // Skip this check if forceRefreshToken is true (session changed client-side)
      const wasServerRendered = !!nuxtApp.payload?.serverRendered
      if (wasServerRendered && !convexToken.value && !convexUser.value && !forceRefreshToken) {
        return null
      }

      // Negative cache: if we recently confirmed no session, don't re-check
      // This prevents duplicate 401 requests during Convex client initialization
      if (!convexToken.value && Date.now() - lastNullTokenCheck < NULL_TOKEN_CACHE_MS) {
        return null
      }

      // CSR mode: must fetch token (unavoidable for HttpOnly cookie auth)
      try {
        const response = await authClient!.convex.token()

        // Check if operation was cancelled after async operation
        if (signal?.aborted) return null

        if (response.error || !response.data?.token) {
          convexToken.value = null
          convexUser.value = null
          // Set auth error if there was an explicit error response
          if (response.error) {
            const errorMsg = typeof response.error === 'object' && response.error !== null && 'message' in response.error
              ? String((response.error as { message: unknown }).message)
              : 'Authentication failed'
            convexAuthError.value = errorMsg
          }
          lastNullTokenCheck = Date.now() // Cache the "no session" result
          return null
        }
        const token = response.data.token
        convexToken.value = token
        convexAuthError.value = null // Clear any previous error on success
        lastTokenValidation = Date.now()

        // In CSR mode, extract user from JWT since server didn't hydrate it
        if (!convexUser.value) {
          convexUser.value = decodeUserFromJwt(token)
        }

        return token
      } catch (e) {
        // Check if operation was cancelled
        if (signal?.aborted) return null

        convexToken.value = null
        convexUser.value = null
        // Set auth error for caught exceptions
        convexAuthError.value = e instanceof Error ? e.message : 'Authentication request failed'
        lastNullTokenCheck = Date.now() // Cache the failed result
        return null
      }
    }

    client.setAuth(fetchToken, (isAuthenticated) => {
      logger.debug(`Auth state: ${isAuthenticated ? 'authenticated' : 'unauthenticated'}`)
    })

    // Watch Better Auth session changes and sync to Convex state
    // This ensures useConvexAuth() updates reactively after login/logout
    const session = authClient.useSession()
    watch(
      () => session.value.data,
      async (sessionData, oldSessionData) => {
        // Cancel any in-flight operation to prevent race conditions
        currentAuthOperation?.abort()
        currentAuthOperation = new AbortController()
        const { signal } = currentAuthOperation

        const hadSession = !!oldSessionData
        const hasSession = !!sessionData

        if (hasSession && !hadSession) {
          // LOGIN: User logged in - clear caches and fetch fresh token
          convexPending.value = true
          try {
            lastNullTokenCheck = 0
            lastTokenValidation = 0
            await fetchToken({ forceRefreshToken: true, signal })
            logger.auth({ phase: 'login', outcome: 'success' })
          } finally {
            // Only update pending if this operation wasn't cancelled
            if (!signal.aborted) {
              convexPending.value = false
            }
          }
        } else if (!hasSession && hadSession) {
          // LOGOUT: User logged out - clear state immediately
          convexPending.value = false // Reset pending in case login was in progress
          convexToken.value = null
          convexUser.value = null
          logger.auth({ phase: 'logout', outcome: 'success' })
        }
      },
    )
  }

  // Provide clients globally
  nuxtApp.provide('convex', client)
  if (authClient) {
    nuxtApp.provide('auth', authClient)
  }

  // Expose for debugging
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__convex_client__ = client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (authClient) (window as any).__auth_client__ = authClient

    // Setup DevTools bridge in dev mode
    if (import.meta.dev) {
      import('./devtools/bridge-setup').then(({ setupDevToolsBridge }) => {
        setupDevToolsBridge(client, convexToken, convexUser, convexAuthWaterfall)
      })
    }
  }

  endInit()

  // Log initial auth state if hydrated from SSR
  if (convexToken.value) {
    logger.auth({ phase: 'hydrate', outcome: 'success', details: { source: 'ssr' } })
  } else {
    logger.debug('Client initialized (no auth)')
  }
})
