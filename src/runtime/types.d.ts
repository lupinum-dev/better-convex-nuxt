import type { AuthClientPlugins, ConvexAuthClientDefinition } from './auth-client'
import type { ConvexAuthCoordinator } from './auth/client-engine'
import type { AuthIdentityPort } from './auth/identity-port'
import type { ConvexClientOwner } from './client/client-owner'
import type { ConvexAuthPageMeta } from './utils/auth-route-protection'

// The public `$convex` and `$auth` Nuxt-app property augmentations are deleted
// (vNext §5.4): consumers use the stable `useConvex()` handle and the auth
// composables, never a raw replaceable client or a generic proxy. The auth plugin
// still `provide('auth', …)` for internal use, read via a local cast, never a
// published typed property. The augmentations below are INTERNAL inter-plugin
// seams (browser-only).
declare module '#app' {
  interface NuxtApp {
    /**
     * The per-Nuxt-app client owner (vNext §5.4, internal §4.1). Sole source of
     * truth for the replaceable primary and lazy anonymous clients; `useConvex()`
     * returns its stable handle and `useConvexConnectionState()` observes its
     * connection store. Provided by the core client plugin (browser only).
     */
    $convexClientOwner?: ConvexClientOwner
    /** The per-app auth coordinator (Phase 3). Auth-enabled builds only. */
    $convexAuthCoordinator?: ConvexAuthCoordinator
    /** Frozen auth identity port published by the coordinator; auth builds only. */
    $convexAuthPort?: AuthIdentityPort
  }
  interface PageMeta {
    convexAuth?: ConvexAuthPageMeta
  }
}

// The generated `#convex/auth-client` virtual module re-exports the resolved
// definition (default export). `src/module.ts` sets the alias for consumer builds
// and the tsConfig path; this ambient declaration lets the module's OWN source
// typecheck resolve the import.
declare module '#convex/auth-client' {
  const definition: ConvexAuthClientDefinition<AuthClientPlugins>
  export default definition
}

export {}
