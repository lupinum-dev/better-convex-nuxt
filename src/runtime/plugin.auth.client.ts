import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'

/**
 * Auth-enabled-only client plugin (vNext §5.1 / §8 "Client instantiation").
 * Registered by the module ONLY when `auth !== false`, so a Convex-only build
 * never pulls this file — or any Better Auth runtime — into its client graph. It
 * resolves the typed auth-client definition, creates exactly one Better Auth
 * client for this Nuxt app, prepends the Convex client plugin, constructs the
 * per-app auth coordinator, attaches it to the primary, and hands the client
 * owner the coordinator's frozen {@link AuthIdentityPort}.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState, clearNuxtData } from '#app'
import convexAuthClientDefinition from '#convex/auth-client'

import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinator,
} from './auth/client-engine'
import { validateConvexAuthClientDefinition } from './auth/validate-auth-client-definition'
import type { ConvexClientOwner } from './client/client-owner'
import type { AuthWaterfall } from './devtools/types'
import { useConvexAuthPendingState } from './utils/auth-pending-state'
import { readAuthMode } from './utils/convex-cache'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'
import type { ConvexUser } from './utils/types'

type AuthDebugWindow = Window & {
  __auth_client__?: AuthClientWithConvex
}

export default defineNuxtPlugin({
  // Must run AFTER `plugin.client` provides `$convexClientOwner`: this plugin
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

    const publicConvex = config.public.convex as Record<string, unknown> | undefined
    const logger = createLogger(getLogLevel(publicConvex))
    const endInit = logger.time('plugin:init (client auth)')

    // HMR-safe: the coordinator is provided only by this plugin. Reuse per-app.
    if (nuxtApp.$convexAuthCoordinator) {
      logger.debug('plugin:init (client auth) skipped; already initialized')
      endInit()
      return
    }

    // Read the current primary through the per-app client owner (the public
    // `$convex` augmentation is deleted, vNext §5.4).
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

    // 1–2. Resolve and runtime-validate the typed definition (JS/untyped safety).
    const definitionOptions = validateConvexAuthClientDefinition(convexAuthClientDefinition)

    let authClient: AuthClientWithConvex | null = null
    if (resolvedSiteUrl) {
      // 4. Module-owned baseURL from the single normalized `auth.route`.
      const authBaseURL =
        typeof window !== 'undefined'
          ? `${window.location.origin}${authConfig.route}`
          : authConfig.route
      // 3/5/6. One client per app; prepend exactly one Convex client plugin;
      // library owns credentials.
      const { plugins: consumerPlugins, ...baseOptions } = definitionOptions
      authClient = createAuthClient({
        ...baseOptions,
        baseURL: authBaseURL,
        plugins: [convexClient(), ...(consumerPlugins ?? [])],
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
        token: convexToken,
        user: convexUser,
        pending: convexPending,
        authError: convexAuthError,
      },
      logger,
      wasServerRendered: () => Boolean(nuxtApp.payload?.serverRendered),
      // Identity purge (internal §7.1): drop `required`/`optional` Convex payload
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
    nuxtApp.provide('convexAuthCoordinator', coordinator)
    nuxtApp.provide('convexAuthPort', coordinator.port)

    // Install the initial setAuth on the owner's primary and drive settlement.
    coordinator.attachPrimary(client)

    // Hand the client owner the frozen port so it retires and replaces the
    // identity-scoped primary on every stable identity-key change (vNext §5.4).
    clientOwner.attachAuthPort(coordinator.port)
    clientOwner.addDisposer(() => coordinator.dispose())

    if (typeof window !== 'undefined' && import.meta.dev && authClient) {
      ;(window as AuthDebugWindow).__auth_client__ = authClient
    }

    endInit()
  },
})
