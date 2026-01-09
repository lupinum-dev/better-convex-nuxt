/**
 * Client-side Convex plugin with SSR token hydration.
 * Manually wires up setAuth() for zero-flash auth on first render.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState } from '#app'
import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import { ConvexClient } from 'convex/browser'
import { createModuleLogger, getLoggingOptions, createTimer } from './utils/logger'
import type { PluginInitEvent, AuthChangeEvent } from './utils/logger'

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

    const fetchToken = async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
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

      // Not authenticated if no SSR state
      if (!convexToken.value && !convexUser.value) {
        return null
      }

      // Fetch fresh token from Better Auth
      try {
        const response = await authClient!.convex.token()
        if (response.error || !response.data?.token) {
          convexToken.value = null
          return null
        }
        convexToken.value = response.data.token
        lastTokenValidation = Date.now()
        return response.data.token
      } catch {
        convexToken.value = null
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
