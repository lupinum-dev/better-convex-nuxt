import type { createAuthClient } from 'better-auth/vue'
import type { ConvexClient } from 'convex/browser'

import type { ConvexAuthEngine } from './auth/client-engine'
import type { AuthIdentityPort } from './auth/identity-port'
import type { ConvexClientOwner } from './client/client-owner'
import type { ConvexAuthPageMeta } from './utils/auth-route-protection'

type AuthClient = ReturnType<typeof createAuthClient>

declare module '#app' {
  interface NuxtApp {
    /**
     * The primary Convex client, provided by the core client plugin. Phase 1
     * inter-plugin handoff; the Phase 3 client owner replaces this raw handoff
     * and the `useConvex()` handle contract removes the public raw client.
     */
    $convex?: ConvexClient
    /**
     * The per-Nuxt-app client owner (vNext §5.4, internal §4.1). Sole source of
     * truth for the replaceable primary and lazy anonymous clients; `useConvex()`
     * returns its stable handle and `useConvexConnectionState()` observes its
     * connection store. Provided by the core client plugin (browser only).
     */
    $convexClientOwner?: ConvexClientOwner
    $auth?: AuthClient
    $convexAuthEngine?: ConvexAuthEngine
    /** Frozen auth identity port (adapter over the engine); auth builds only. */
    $convexAuthPort?: AuthIdentityPort
    /** Internal in-flight promise for the engine's refreshAuth() dedupe. */
    _convexRefreshAuthPromise?: Promise<void> | null
  }
  interface RuntimeNuxtHooks {
    'better-convex:auth:refresh': () => void | Promise<void>
  }
  interface PageMeta {
    convexAuth?: ConvexAuthPageMeta
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $convex?: ConvexClient
    $auth?: AuthClient
  }
}

export {}
