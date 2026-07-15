import type { AuthClientPlugins, ConvexAuthClientDefinition } from './auth-client'
import type { ConvexRuntimeContext } from './runtime-context'
import type { ConvexAuthPageMeta } from './utils/auth-route-protection'

// The public `$convex` and `$auth` Nuxt-app property augmentations are deleted
// : consumers use the stable `useConvex()` handle and the auth
// composables, never a raw replaceable client or a generic proxy. The auth plugin
// still `provide('auth', …)` for internal use, read via a local cast, never a
// published typed property. The augmentations below are INTERNAL inter-plugin
// seam (browser-only).
declare module '#app' {
  interface NuxtApp {
    /**
     * The per-Nuxt-app client owner (architecture invariant). Sole source of
     * truth for the replaceable primary and lazy anonymous clients; `useConvex()`
     * returns its stable handle and `useConvexConnectionState()` observes its
     * connection store. Provided by the core client plugin (browser only).
     */
    $convexRuntime?: ConvexRuntimeContext
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
