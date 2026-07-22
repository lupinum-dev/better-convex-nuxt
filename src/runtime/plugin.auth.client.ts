import { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'
import { effectScope } from 'vue'

/**
 * Auth-enabled-only client plugin ("Client instantiation").
 * Registered by the module ONLY when `auth !== false`, so a Convex-only build
 * never pulls this file — or any Better Auth runtime — into its client graph. It
 * resolves the typed auth-client definition, creates exactly one Better Auth
 * client for this Nuxt app, constructs the
 * per-app auth coordinator, attaches it to the primary, and hands the client
 * owner the coordinator's frozen {@link AuthIdentityPort}.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, clearNuxtData } from '#app'
import convexAuthClientDefinition from '#convex/auth-client'

import { convexClientPlugin } from './auth-client/convex-client-plugin'
import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinator,
} from './auth/client-engine'
import { observeBetterAuthSession } from './auth/session-observer'
import { validateConvexAuthClientDefinition } from './auth/validate-auth-client-definition'
import type { AuthWaterfall } from './devtools/types'
import { readConvexRuntimeContext } from './runtime-context'
import { useConvexIdentityState } from './utils/auth-identity-state'
import { useConvexAuthPendingState } from './utils/auth-pending-state'
import { readAuthMode } from './utils/convex-cache'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'

export default defineNuxtPlugin({
  // Must run AFTER `plugin.client` provides `$convexRuntime`: this plugin
  // attaches the auth coordinator to the owner's primary. The async module
  // `setup` registers the core plugin first but Nuxt does not preserve that
  // order across the `await` between `addPlugin` calls, so pin it explicitly.
  name: 'convex:auth-client',
  dependsOn: ['convex:core-client'],
  setup(nuxtApp) {
    const config = useRuntimeConfig()
    const convexConfig = getConvexRuntimeConfig()
    const authConfig = convexConfig.auth
    if (authConfig === false) return // Defensive: module never registers this when disabled.

    const runtime = readConvexRuntimeContext(nuxtApp)
    const publicConvex = config.public.convex as Record<string, unknown> | undefined
    const logLevel = getLogLevel(publicConvex)
    const logger = runtime?.logger ?? createLogger(logLevel)
    const endInit = logger.time('plugin:init (client auth)')
    const traceEnabled =
      logLevel === 'debug' && (authConfig.debug.authFlow || authConfig.debug.clientAuthFlow)
    const trace = (
      phase: string,
      outcome: 'success' | 'error' | 'skip' | 'miss',
      details: Record<string, boolean> = {},
    ) => {
      if (!traceEnabled) return
      logger.auth({ phase, outcome, details: { component: 'client-auth', ...details } })
    }

    // HMR-safe: the coordinator is provided only by this plugin. Reuse per-app.
    if (runtime?.getAuthCoordinator()) {
      trace('client.auth.initialization', 'skip', { alreadyInitialized: true })
      logger.debug('plugin:init (client auth) skipped; already initialized')
      endInit()
      return
    }

    // Read the current primary through the per-app client owner.
    const clientOwner = runtime?.owner
    const client = clientOwner?.getPrimary()?.client as ConvexClient | undefined
    if (!runtime || !clientOwner || !client) {
      trace('client.auth.initialization', 'error', { coreClientAvailable: false })
      logger.debug('Core Convex client owner is unavailable; auth plugin cannot initialize')
      endInit()
      return
    }

    const convexUrl = convexConfig.url
    const resolvedSiteUrl = convexConfig.siteUrl

    const convexIdentity = useConvexIdentityState()
    const convexAuthError = useState<string | null>('convex:authError', () => null)
    const convexPending = useConvexAuthPendingState()
    useState<AuthWaterfall | null>('convex:authWaterfall', () => null)

    // 1–2. Resolve and runtime-validate the typed definition (JS/untyped safety).
    const definitionOptions = validateConvexAuthClientDefinition(convexAuthClientDefinition)

    let authClient: AuthClientWithConvex | null = null
    trace('client.auth.initialization', 'success', { coreClientAvailable: true })
    if (resolvedSiteUrl) {
      // Fixed same-origin proxy contract.
      const authBaseURL = `${window.location.origin}/api/auth`
      // 3/5/6. One client per app; the library owns credentials and transport.
      const { plugins: consumerPlugins, ...baseOptions } = definitionOptions
      authClient = createAuthClient({
        ...baseOptions,
        baseURL: authBaseURL,
        plugins: [convexClientPlugin(), ...(consumerPlugins ?? [])],
        fetchOptions: { credentials: 'include' },
        // The ambient definition's `plugins` is the broad `BetterAuthClientPlugin[]`,
        // so `createAuthClient` infers a widened client whose static `signIn`/etc.
        // collapse; the runtime instance is correct. Cast through `unknown`.
      }) as unknown as AuthClientWithConvex
    } else {
      convexAuthError.value =
        convexAuthError.value ??
        `[better-convex-nuxt] Missing Convex site URL; cannot initialize auth for ${convexUrl ?? 'the configured deployment'}`
    }

    const coordinator: ConvexAuthCoordinator = createConvexAuthCoordinator({
      authClient,
      state: {
        identity: convexIdentity,
        pending: convexPending,
        authError: convexAuthError,
      },
      logger,
      // Identity purge (architecture invariant): drop `required`/`optional` Convex payload
      // keys on a stable identity-key change; `none` keys are identity-independent
      // and retained. Query composables clear their own local state via the
      // identityGeneration watch; this only sweeps SSR payload namespaces.
      purgeIdentityPayloads: () => {
        clearNuxtData((key) => {
          const mode = readAuthMode(key)
          return mode === 'required' || mode === 'optional'
        })
      },
    })

    // 7. Provide the instance on nuxtApp; 8. the coordinator got the same instance.
    nuxtApp.provide('auth', authClient)
    runtime.attachAuthCoordinator(coordinator)

    // Install the initial setAuth on the owner's primary and drive settlement.
    coordinator.attachPrimary(client)

    // Better Auth's public session hook is the sole live session source. Raw
    // plugin calls, MFA completion, expiry, and cross-tab logout all converge
    // through this watcher; wrappers are ergonomics only.
    const sessionScope = effectScope()
    if (authClient) {
      sessionScope.run(() => {
        observeBetterAuthSession(authClient, (sessionToken, errorMessage) => {
          void coordinator.reconcileSession(sessionToken, errorMessage)
        })
      })
    }

    // Hand the client owner the frozen port so it retires and replaces the
    // identity-scoped primary on every stable identity-key change .
    clientOwner.attachAuthPort(coordinator.port)
    clientOwner.addDisposer(() => {
      sessionScope.stop()
      coordinator.dispose()
    })

    endInit()
    trace('client.auth.initialization', 'success', { authClientConfigured: authClient !== null })
  },
})
