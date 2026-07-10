import { ConvexClient } from 'convex/browser'

/**
 * Core client plugin (vNext §5.1). Always installed. Creates the per-Nuxt-app
 * client owner (which constructs the primary Convex WebSocket client) and imports
 * NO Better Auth code, so an auth-disabled build graph contains no auth runtime.
 * The auth-enabled-only `plugin.auth.client` attaches the auth engine to the
 * owner's primary client and hands the owner the auth port that drives
 * identity-scoped primary replacement.
 */
import { defineNuxtPlugin, useRuntimeConfig, useState } from '#app'

import { createConvexClientOwner, type OwnedConvexClient } from './client/client-owner'
import { useConvexAuthPendingState } from './utils/auth-pending-state'
import { createLogger, getLogLevel } from './utils/logger'
import { getConvexRuntimeConfig } from './utils/runtime-config'
import type { ConvexUser } from './utils/types'

type ConvexDebugWindow = Window & {
  __convex_client__?: ConvexClient
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()
  const publicConvex = config.public.convex as Record<string, unknown> | undefined
  const logger = createLogger(getLogLevel(publicConvex))
  const endInit = logger.time('plugin:init (client core)')

  // HMR-safe initialization: reuse the live owner on plugin reevaluation.
  if (nuxtApp.$convexClientOwner) {
    logger.debug('plugin:init (client core) skipped; already initialized')
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
  const convexToken = useState<string | null>('convex:token', () => null)
  const convexUser = useState<ConvexUser | null>('convex:user', () => null)

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
  })

  const primary = owner.getPrimary()?.client as ConvexClient | undefined

  // Pending state for auth operations. Auth-disabled builds settle immediately;
  // the auth plugin owns settlement when auth is enabled.
  const convexPending = useConvexAuthPendingState()
  if (!isAuthEnabled) {
    convexPending.value = false
  }

  nuxtApp.provide('convexClientOwner', owner)
  // Raw-client handoff for the auth plugin's initial engine attach and DevTools.
  // The public raw-client contract is removed; consumers use the useConvex()
  // handle (vNext §5.4). This internal provide is a Phase 1 inter-plugin seam.
  if (primary) nuxtApp.provide('convex', primary)

  // Expose for debugging and wire the DevTools bridge (dev only).
  if (typeof window !== 'undefined' && import.meta.dev && primary) {
    ;(window as ConvexDebugWindow).__convex_client__ = primary
    const convexAuthWaterfall = useState('convex:authWaterfall', () => null)
    const convexDevtoolsInstanceId = useState<string>(
      'convex:devtoolsInstanceId',
      () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    )
    void import('./devtools/bridge-setup').then(({ setupDevToolsBridge }) => {
      void setupDevToolsBridge(
        primary,
        convexToken,
        convexUser,
        convexAuthWaterfall,
        convexDevtoolsInstanceId.value,
      )
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
})
