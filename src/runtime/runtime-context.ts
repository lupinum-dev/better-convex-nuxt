import type { ConvexAuthCoordinator } from './auth/client-engine'
import type { ConvexClientOwner } from './client/client-owner'

/** The single mutable attachment owned by one Nuxt application. */
export interface ConvexRuntimeContext {
  readonly owner: ConvexClientOwner
  getAuthCoordinator(): ConvexAuthCoordinator | null
  attachAuthCoordinator(coordinator: ConvexAuthCoordinator): void
}

/** Read the internal Nuxt attachment without requiring consumer augmentations. */
export function readConvexRuntimeContext(nuxtApp: unknown): ConvexRuntimeContext | undefined {
  return (nuxtApp as { $convexRuntime?: ConvexRuntimeContext }).$convexRuntime
}

export function createConvexRuntimeContext(owner: ConvexClientOwner): ConvexRuntimeContext {
  let authCoordinator: ConvexAuthCoordinator | null = null

  const context: ConvexRuntimeContext = {
    owner,
    getAuthCoordinator: () => authCoordinator,
    attachAuthCoordinator(coordinator) {
      if (authCoordinator && authCoordinator !== coordinator) {
        throw new Error('[convex-runtime] auth coordinator is already attached')
      }
      authCoordinator = coordinator
    },
  }
  return Object.freeze(context)
}
