import type { ConvexAuthEngine } from './auth/client-engine'
import type { AuthIdentityPort } from './auth/identity-port'
import type { ConvexClientOwner } from './client/client-owner'
import type { ConvexAuthPageMeta } from './utils/auth-route-protection'

// The public `$convex` and `$auth` Nuxt-app property augmentations are deleted
// (vNext §5.4): consumers use the stable `useConvex()` handle and the auth
// composables, never a raw replaceable client or a generic proxy. The `$convex`
// provide is removed entirely — the auth plugin and DevTools read the current
// primary through the client owner. The auth plugin still `provide('auth', …)`
// for internal use, read via a local cast, never a published typed property.
// The augmentations below are INTERNAL inter-plugin seams (browser-only).
declare module '#app' {
  interface NuxtApp {
    /**
     * The per-Nuxt-app client owner (vNext §5.4, internal §4.1). Sole source of
     * truth for the replaceable primary and lazy anonymous clients; `useConvex()`
     * returns its stable handle and `useConvexConnectionState()` observes its
     * connection store. Provided by the core client plugin (browser only).
     */
    $convexClientOwner?: ConvexClientOwner
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

export {}
