/**
 * Client-side Convex plugin with SSR token hydration.
 * Manually wires up setAuth() for zero-flash auth on first render.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, useRouter } from '#app'
import { toRaw } from 'vue'
import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import { ConvexClient } from 'convex/browser'
import { createModuleLogger, getLoggingOptions, createTimer } from './utils/logger'
import { matchesSkipRoute } from './utils/route-matcher'
import type { PluginInitEvent, AuthChangeEvent } from './utils/logger'
import type { Ref } from 'vue'
import type { ConvexDevToolsBridge, ConvexUser, JWTClaims, EnhancedAuthState, AuthState, AuthWaterfall } from './devtools/types'

interface TokenResponse {
  data?: { token: string } | null
  error?: unknown
}

interface ConvexUserData {
  id: string
  name?: string
  email?: string
  emailVerified?: boolean
  image?: string
}

/**
 * Decode user info from JWT payload (for CSR mode where server doesn't hydrate user)
 */
function decodeUserFromJwt(token: string): ConvexUserData | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    if (!payload) return null
    // Handle URL-safe base64 encoding
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const claims = JSON.parse(decoded)
    if (claims.sub || claims.userId || claims.email) {
      return {
        id: claims.sub || claims.userId || '',
        name: claims.name || '',
        email: claims.email || '',
        emailVerified: claims.emailVerified,
        image: claims.image,
      }
    }
  } catch {
    // Ignore decode errors
  }
  return null
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
  const loggingOptions = getLoggingOptions(config.public.convex ?? {})
  const logger = createModuleLogger(loggingOptions)
  const initTimer = createTimer()

  // HMR-safe initialization
  if (nuxtApp._convexInitialized) return
  nuxtApp._convexInitialized = true

  const convexUrl = config.public.convex?.url as string | undefined
  const siteUrl =
    (config.public.convex?.siteUrl as string | undefined) ||
    convexUrl?.replace('.convex.cloud', '.convex.site')

  if (!convexUrl) {
    logger.event({
      event: 'plugin:init',
      env: 'client',
      config: { url: '', siteUrl: '', authEnabled: false },
      duration_ms: initTimer(),
      outcome: 'error',
      error: { type: 'ConfigError', message: 'No Convex URL configured', hint: 'Set CONVEX_URL or convex.url in nuxt.config' },
    } satisfies PluginInitEvent)
    return
  }

  // SSR-hydrated auth state
  const convexToken = useState<string | null>('convex:token')
  const convexUser = useState<unknown>('convex:user')
  const convexAuthWaterfall = useState<AuthWaterfall | null>('convex:authWaterfall')

  // Track auth state for logging
  let currentAuthState: 'loading' | 'authenticated' | 'unauthenticated' = convexToken.value
    ? 'authenticated'
    : 'unauthenticated'

  // Create Convex WebSocket client
  const client = new ConvexClient(convexUrl)
  let authClient: AuthClientWithConvex | null = null
  const authEnabled = !!siteUrl

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
    const TOKEN_CACHE_MS = 10000
    const skipRoutes = (config.public.convex?.skipAuthRoutes as string[]) || []
    const router = useRouter()

    const fetchToken = async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
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
      const wasServerRendered = !!nuxtApp.payload?.serverRendered
      if (wasServerRendered && !convexToken.value && !convexUser.value) {
        return null
      }

      // CSR mode: must fetch token (unavoidable for HttpOnly cookie auth)
      try {
        const response = await authClient!.convex.token()
        if (response.error || !response.data?.token) {
          convexToken.value = null
          convexUser.value = null
          return null
        }
        const token = response.data.token
        convexToken.value = token
        lastTokenValidation = Date.now()

        // In CSR mode, extract user from JWT since server didn't hydrate it
        if (!convexUser.value) {
          convexUser.value = decodeUserFromJwt(token)
        }

        return token
      } catch {
        convexToken.value = null
        convexUser.value = null
        return null
      }
    }

    client.setAuth(fetchToken, (isAuthenticated) => {
      const previousState = currentAuthState
      const newState = isAuthenticated ? 'authenticated' : 'unauthenticated'

      if (previousState !== newState) {
        currentAuthState = newState
        logger.event({
          event: 'auth:change',
          env: 'client',
          from: previousState,
          to: newState,
          trigger: 'token-refresh',
          user_id: convexUser.value
            ? String((convexUser.value as { id?: string }).id || '').slice(0, 8)
            : undefined,
        } satisfies AuthChangeEvent)
      }
    })
  }

  // Provide clients globally
  nuxtApp.provide('convex', client)
  if (authClient) {
    nuxtApp.provide('auth', authClient)
  }

  // Expose for debugging
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__convex_client__ = client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (authClient) (window as any).__auth_client__ = authClient

    // Setup DevTools bridge in dev mode
    if (import.meta.dev) {
      setupDevToolsBridge(client, convexUrl, convexToken, convexUser, convexAuthWaterfall)
    }
  }

  // Log successful initialization
  logger.event({
    event: 'plugin:init',
    env: 'client',
    config: {
      url: convexUrl,
      siteUrl: siteUrl || '',
      authEnabled,
    },
    duration_ms: initTimer(),
    outcome: 'success',
  } satisfies PluginInitEvent)

  // Log initial auth state if hydrated from SSR
  if (convexToken.value) {
    logger.event({
      event: 'auth:change',
      env: 'client',
      from: 'loading',
      to: 'authenticated',
      trigger: 'ssr-hydration',
      user_id: convexUser.value
        ? String((convexUser.value as { id?: string }).id || '').slice(0, 8)
        : undefined,
    } satisfies AuthChangeEvent)
  }
})

/**
 * Setup the DevTools bridge on the window object.
 * Only called in dev mode.
 */
async function setupDevToolsBridge(
  client: ConvexClient,
  convexUrl: string,
  convexToken: Ref<string | null>,
  convexUser: Ref<unknown>,
  convexAuthWaterfall: Ref<AuthWaterfall | null>,
): Promise<void> {
  // Dynamically import DevTools modules to avoid bundling in production
  const [queryRegistry, eventBuffer, mutationRegistry] = await Promise.all([
    import('./devtools/query-registry'),
    import('./devtools/event-buffer'),
    import('./devtools/mutation-registry'),
  ])

  /**
   * Decode a JWT token to extract claims.
   * Pure client-side decoding, no external dependencies.
   */
  function decodeJWT(token: string): JWTClaims | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null
      // Handle URL-safe base64 encoding
      const payload = parts[1]
      if (!payload) return null
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
      return JSON.parse(decoded)
    } catch {
      return null
    }
  }

  // Get the Convex Dashboard URL
  const getDashboardUrl = (): string | null => {
    // Extract deployment name from URL (e.g., "happy-animal-123" from "https://happy-animal-123.convex.cloud")
    try {
      const url = new URL(convexUrl)
      const hostname = url.hostname
      if (hostname.endsWith('.convex.cloud')) {
        const deploymentName = hostname.replace('.convex.cloud', '')
        return `https://dashboard.convex.dev/d/${deploymentName}`
      }
    } catch {
      // Invalid URL
    }
    return null
  }

  const bridge: ConvexDevToolsBridge = {
    version: '1.1.0',

    getQueries: () => queryRegistry.getActiveQueries(),

    getQueryDetail: (id: string) => queryRegistry.getQuery(id),

    subscribeToQueries: (callback) => queryRegistry.subscribeToQueries(callback),

    getMutations: () => mutationRegistry.getMutations(),

    subscribeToMutations: (callback) => mutationRegistry.subscribeToMutations(callback),

    getAuthState: (): AuthState => {
      // Use toRaw to unwrap Vue proxy (BroadcastChannel can't clone proxies)
      const rawUser = toRaw(convexUser.value) as ConvexUser | null
      const hasToken = !!convexToken.value
      // Check for valid user by looking for required fields (more stable than Object.keys().length)
      // Object.keys() on Vue proxies can be unreliable and cause flickering
      const hasUser = !!(rawUser && typeof rawUser === 'object' && (rawUser.id || rawUser.email))
      // Create a plain object copy to avoid proxy cloning issues
      const plainUser = hasUser ? JSON.parse(JSON.stringify(rawUser)) : null

      return {
        isAuthenticated: !!(hasToken && hasUser),
        isPending: false, // Could be enhanced to track pending state
        user: plainUser,
        tokenStatus: hasToken ? 'valid' : 'none',
      }
    },

    getEnhancedAuthState: (): EnhancedAuthState => {
      const baseState = bridge.getAuthState()
      const token = convexToken.value

      if (!token) {
        return {
          ...baseState,
          claims: undefined,
          issuedAt: undefined,
          expiresAt: undefined,
          expiresInSeconds: undefined,
        }
      }

      const claims = decodeJWT(token)
      const now = Math.floor(Date.now() / 1000)
      const expiresAt = claims?.exp
      const expiresInSeconds = expiresAt ? Math.max(0, expiresAt - now) : undefined

      return {
        ...baseState,
        claims: claims ?? undefined,
        issuedAt: claims?.iat ? claims.iat * 1000 : undefined,
        expiresAt: expiresAt ? expiresAt * 1000 : undefined,
        expiresInSeconds,
      }
    },

    getConnectionState: () => {
      // Get connection state from the Convex client
      const state = client.connectionState()
      return {
        isConnected: state.isWebSocketConnected,
        hasEverConnected: state.hasInflightRequests || state.isWebSocketConnected,
        connectionRetries: 0, // Not exposed by Convex client
        inflightRequests: state.hasInflightRequests ? 1 : 0, // Simplified
      }
    },

    getAuthWaterfall: (): AuthWaterfall | null => {
      // Return the SSR auth waterfall timing data (hydrated from server)
      const waterfall = convexAuthWaterfall.value
      if (!waterfall) return null
      // Create a plain object copy to avoid proxy cloning issues
      return JSON.parse(JSON.stringify(toRaw(waterfall)))
    },

    getEvents: () => eventBuffer.getEventBuffer(),

    subscribeToEvents: (callback) => eventBuffer.subscribeToEvents(callback),

    getDashboardUrl,
  }

  // Expose on window for direct access (same-origin)
  window.__CONVEX_DEVTOOLS__ = bridge

  // Generate a unique instance ID for this tab/window to prevent cross-tab interference
  const instanceId = Math.random().toString(36).slice(2, 10)

  // Use BroadcastChannel for reliable same-origin communication with DevTools iframe
  const channel = new BroadcastChannel('convex-devtools')

  // Handle messages from DevTools iframe via BroadcastChannel
  channel.onmessage = (event) => {
    const data = event.data
    if (!data || typeof data !== 'object') return

    if (data.type === 'CONVEX_DEVTOOLS_INIT') {
      // DevTools iframe is requesting connection
      channel.postMessage({ type: 'CONVEX_DEVTOOLS_READY', instanceId })
    } else if (data.type === 'CONVEX_DEVTOOLS_REQUEST') {
      // DevTools iframe is calling a bridge method
      const { id, method, args } = data
      try {
        const bridgeMethod = bridge[method as keyof ConvexDevToolsBridge]
        if (typeof bridgeMethod === 'function') {
          const result = (bridgeMethod as (...args: unknown[]) => unknown)(...(args || []))
          channel.postMessage({ type: 'CONVEX_DEVTOOLS_RESPONSE', id, result, instanceId })
        } else if (bridgeMethod !== undefined) {
          // Property access
          channel.postMessage({ type: 'CONVEX_DEVTOOLS_RESPONSE', id, result: bridgeMethod, instanceId })
        } else {
          channel.postMessage({ type: 'CONVEX_DEVTOOLS_RESPONSE', id, error: `Unknown method: ${method}`, instanceId })
        }
      } catch (err) {
        channel.postMessage({
          type: 'CONVEX_DEVTOOLS_RESPONSE',
          id,
          error: err instanceof Error ? err.message : String(err),
          instanceId,
        })
      }
    }
  }

  // Subscribe to events and forward to DevTools via BroadcastChannel
  eventBuffer.subscribeToEvents((event) => {
    channel.postMessage({ type: 'CONVEX_DEVTOOLS_EVENT', event })
  })

  // Subscribe to mutations and forward to DevTools via BroadcastChannel
  mutationRegistry.subscribeToMutations((mutations) => {
    channel.postMessage({ type: 'CONVEX_DEVTOOLS_MUTATIONS', mutations })
  })

  // Subscribe to queries and forward to DevTools via BroadcastChannel
  queryRegistry.subscribeToQueries((queries) => {
    channel.postMessage({ type: 'CONVEX_DEVTOOLS_QUERIES', queries })
  })

  // HMR cleanup: close the BroadcastChannel when module is hot-replaced
  // This prevents ghost instances from responding to messages
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      channel.close()
    })
  }
}
