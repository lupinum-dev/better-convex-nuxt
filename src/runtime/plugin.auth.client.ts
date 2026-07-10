import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'

/**
 * Auth-enabled-only client plugin (vNext §5.1). Registered by the module ONLY
 * when `auth !== false`, so a Convex-only build never pulls this file — or any
 * Better Auth runtime — into its client graph. It creates the Better Auth client
 * and auth engine, attaches the engine to the primary client created by the core
 * plugin, and freezes the `AuthIdentityPort` adapter over the engine.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, useRouter } from '#app'

import { createConvexAuthEngine, type AuthClientWithConvex } from './auth/client-engine'
import { createEngineAuthIdentityPort } from './auth/identity-port'
import type { ConvexClientOwner } from './client/client-owner'
import type { AuthWaterfall } from './devtools/types'
import { useConvexAuthPendingState } from './utils/auth-pending-state'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'
import type { ConvexUser } from './utils/types'

type AuthDebugWindow = Window & {
  __auth_client__?: AuthClientWithConvex
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()
  const authConfig = convexConfig.auth
  if (authConfig === false) return // Defensive: module never registers this when disabled.

  const publicConvex = config.public.convex as Record<string, unknown> | undefined
  const logLevel = getLogLevel(publicConvex)
  const logger = createLogger(logLevel)
  const endInit = logger.time('plugin:init (client auth)')

  const enableClientAuthTrace =
    logLevel === 'debug' && (authConfig.debug.authFlow || authConfig.debug.clientAuthFlow)
  const rawAuthLog = logger.auth.bind(logger)
  logger.auth = (event) => {
    rawAuthLog(event)
    if (enableClientAuthTrace) {
      console.log('[BCN_AUTH][client]', {
        phase: event.phase,
        outcome: event.outcome,
        ...event.details,
        error: event.error ? event.error.message : null,
      })
    }
  }

  const convexAuthTraceId = useState<string>(
    'convex:authTraceId',
    () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  )

  // HMR-safe: the auth engine is provided only by this plugin.
  if (nuxtApp.$convexAuthEngine) {
    logger.debug('plugin:init (client auth) skipped; already initialized')
    return
  }

  // Read the current primary through the per-app client owner (the public
  // `$convex` augmentation is deleted, vNext §5.4). The engine attaches to this
  // client; the owner will later replace it on identity change via the port.
  const clientOwner = nuxtApp.$convexClientOwner as ConvexClientOwner | undefined
  const client = clientOwner?.getPrimary()?.client as ConvexClient | undefined
  if (!clientOwner || !client) {
    logger.debug('Core Convex client owner is unavailable; auth plugin cannot initialize')
    endInit()
    return
  }

  const convexUrl = convexConfig.url
  const resolvedSiteUrl = convexConfig.siteUrl

  const convexToken = useState<string | null>('convex:token', () => null)
  const convexUser = useState<ConvexUser | null>('convex:user', () => null)
  const convexAuthError = useState<string | null>('convex:authError', () => null)
  const convexPending = useConvexAuthPendingState()
  useState<AuthWaterfall | null>('convex:authWaterfall', () => null)

  let authClient: AuthClientWithConvex | null = null
  if (resolvedSiteUrl) {
    const authBaseURL =
      typeof window !== 'undefined'
        ? `${window.location.origin}${authConfig.route}`
        : authConfig.route
    authClient = createAuthClient({
      baseURL: authBaseURL,
      plugins: [convexClient()],
      fetchOptions: { credentials: 'include' },
    }) as AuthClientWithConvex
  }

  const router = useRouter()
  const authEngine = createConvexAuthEngine({
    nuxtApp,
    authClient,
    state: {
      token: convexToken,
      user: convexUser,
      pending: convexPending,
      authError: convexAuthError,
    },
    logger,
    traceId: convexAuthTraceId,
    convexUrl,
    isAuthEnabled: true,
    authRoute: authConfig.route,
    getRoute: () => ({ path: router.currentRoute.value.path }),
    wasServerRendered: () => Boolean(nuxtApp.payload?.serverRendered),
  })
  authEngine.attachConvexClient(client)

  // Freeze the AuthIdentityPort adapter over the existing engine. It is the sole
  // publisher of authEpoch/identityGeneration and the only channel through which
  // query gating and the client owner read auth state (internal §7.2).
  const authPort = createEngineAuthIdentityPort({
    engine: authEngine,
    state: {
      token: convexToken,
      user: convexUser,
      pending: convexPending,
      authError: convexAuthError,
    },
  })

  nuxtApp.provide('auth', authClient)
  nuxtApp.provide('convexAuthEngine', authEngine)
  nuxtApp.provide('convexAuthPort', authPort)

  // Hand the client owner the auth port so it replaces the identity-scoped
  // primary client on every stable identity-key change (anonymous↔user and
  // user↔user'); same-user token rotation keeps the current client (vNext §5.4,
  // internal §7.4). The owner drives replacement via the port's server-confirmed
  // candidate handshake; it interprets no tokens itself.
  clientOwner.attachAuthPort(authPort)

  if (typeof window !== 'undefined' && import.meta.dev && authClient) {
    ;(window as AuthDebugWindow).__auth_client__ = authClient
  }

  endInit()
  if (convexToken.value) {
    logger.auth({
      phase: 'hydrate',
      outcome: 'success',
      details: { source: 'ssr' },
    })
  } else {
    logger.auth({
      phase: 'hydrate',
      outcome: 'miss',
      details: { traceId: convexAuthTraceId.value, source: 'client-init' },
    })
  }
})
