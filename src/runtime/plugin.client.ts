import { ConvexClient } from 'convex/browser'
import { computed } from 'vue'

/**
 * Core client plugin (vNext §5.1). Always installed. Creates the per-Nuxt-app
 * client owner (which constructs the primary Convex WebSocket client) and imports
 * NO Better Auth code, so an auth-disabled build graph contains no auth runtime.
 * The auth-enabled-only `plugin.auth.client` attaches the auth engine to the
 * owner's primary client and hands the owner the auth port that drives
 * identity-scoped primary replacement.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState } from '#app'

import { identityToken, identityUser } from './auth/auth-identity'
import { createConvexClientOwner, type OwnedConvexClient } from './client/client-owner'
import { createConvexRuntimeContext, readConvexRuntimeContext } from './runtime-context'
import { useConvexIdentityState } from './utils/auth-identity-state'
import { useConvexAuthPendingState } from './utils/auth-pending-state'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'

export default defineNuxtPlugin({
  // Named so the auth-enabled client plugin can declare an explicit `dependsOn`.
  // The module registers this plugin before `plugin.auth.client`, but the module
  // `setup` is async and Nuxt does not guarantee registration order survives an
  // `await` between `addPlugin` calls — the auth plugin must observe the owner
  // this plugin provides, so the ordering is pinned by name, not by array order.
  name: 'convex:core-client',
  setup(nuxtApp) {
    const config = useRuntimeConfig()
    const convexConfig = getConvexRuntimeConfig()
    const publicConvex = config.public.convex as Record<string, unknown> | undefined
    const logger = createLogger(getLogLevel(publicConvex))
    const endInit = logger.time('plugin:init (client core)')

    // HMR-safe initialization: reuse the live owner on plugin reevaluation.
    if (readConvexRuntimeContext(nuxtApp)) {
      logger.debug('plugin:init (client core) skipped; already initialized')
      endInit()
      return
    }

    const convexUrl = convexConfig.url
    const isAuthEnabled = convexConfig.auth !== false

    if (!convexUrl) {
      logger.debug('No Convex URL configured; core client owner not created')
      endInit()
      return
    }

    // SSR-hydrated auth state holders (populated by the server plugin only when
    // auth is enabled; initialized here so readers never hit undefined).
    const convexIdentity = useConvexIdentityState()
    const convexToken = computed(() => identityToken(convexIdentity.value))
    const convexUser = computed(() => identityUser(convexIdentity.value))

    // Every library-created browser ConvexClient must set unsavedChangesWarning:false.
    // Convex registers a per-client beforeunload listener that close() does not
    // remove; a retired client with an in-flight mutation would otherwise arm the
    // unsaved-changes dialog permanently (vNext §5.2, decision 6).
    const makeClient = (): OwnedConvexClient =>
      new ConvexClient(convexUrl, {
        unsavedChangesWarning: false,
      }) as unknown as OwnedConvexClient

    // The owner is the single source of truth for the primary and the lazy
    // anonymous `none` client. In an auth-enabled build `none` uses a dedicated
    // anonymous client that never receives setAuth; in an auth-disabled build the
    // permanently-anonymous primary is reused (vNext §7.5), so no anonymousFactory
    // is supplied.
    const owner = createConvexClientOwner({
      primaryFactory: makeClient,
      ...(isAuthEnabled ? { anonymousFactory: makeClient } : {}),
      logger,
    })
    const runtime = createConvexRuntimeContext(owner)

    // Pending state for auth operations. Auth-disabled builds settle immediately;
    // the auth plugin owns settlement when auth is enabled.
    const convexPending = useConvexAuthPendingState()
    if (!isAuthEnabled) {
      convexPending.value = false
    }

    nuxtApp.provide('convexRuntime', runtime)
    // The public raw-client augmentation is deleted (vNext §5.4): consumers use the
    // useConvex() handle. The auth plugin reads the current primary through the
    // owner (`getPrimary()`), and DevTools reads through that owner too, so no
    // `$convex` provide is needed.

    // Wire the per-app DevTools bridge in development only.
    if (typeof window !== 'undefined' && import.meta.dev && owner.getPrimary()) {
      const convexAuthWaterfall = useState('convex:authWaterfall', () => null)
      const convexDevtoolsInstanceId = useState<string>(
        'convex:devtoolsInstanceId',
        () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      )
      void Promise.all([import('./devtools/bridge-setup'), import('./devtools/sink')])
        .then(async ([{ setupDevToolsBridge }, { createDevtoolsSink }]) => {
          const sink = createDevtoolsSink()
          const detachSink = owner.attachDevtoolsSink(sink)
          if (!detachSink) return
          let disposeBridge: () => void
          try {
            disposeBridge = await setupDevToolsBridge(
              owner,
              sink,
              convexToken,
              convexUser,
              convexAuthWaterfall,
              convexDevtoolsInstanceId.value,
            )
          } catch (error) {
            detachSink()
            throw error
          }
          owner.addDisposer(() => {
            disposeBridge()
            detachSink()
          })
        })
        .catch((error) => {
          logger.debug('DevTools bridge setup failed', error)
        })
    }

    // App-lifetime teardown. Vue 3.5 exposes the hook on the app instance, not as a
    // Nuxt hook. The owner's disposer closes every allocated client — primary,
    // replacement candidates, and the anonymous `none` client (vNext §5.2, §4.2).
    nuxtApp.vueApp.onUnmount(() => {
      void owner.dispose()
    })

    endInit()
    logger.debug(`Core client owner initialized (auth ${isAuthEnabled ? 'enabled' : 'disabled'})`)
  },
})
