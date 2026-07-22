import type { ConvexAuthCoordinator } from './auth/client-engine'
import type { ConvexClientOwner } from './client-core/client-owner'
import type { DevtoolsSink } from './devtools/sink'
import type { Logger } from './utils/logger'

/** The single mutable attachment owned by one Nuxt application. */
export interface ConvexRuntimeContext {
  readonly owner: ConvexClientOwner
  readonly logger: Logger
  getAuthCoordinator(): ConvexAuthCoordinator | null
  attachAuthCoordinator(coordinator: ConvexAuthCoordinator): void
  getDevtoolsSink(): DevtoolsSink | null
  attachDevtoolsSink(sink: DevtoolsSink): (() => void) | null
}

/** Read the internal Nuxt attachment without requiring consumer augmentations. */
export function readConvexRuntimeContext(nuxtApp: unknown): ConvexRuntimeContext | undefined {
  return (nuxtApp as { $convexRuntime?: ConvexRuntimeContext }).$convexRuntime
}

export function createConvexRuntimeContext(
  owner: ConvexClientOwner,
  logger: Logger,
): ConvexRuntimeContext {
  let authCoordinator: ConvexAuthCoordinator | null = null
  let devtoolsSink: DevtoolsSink | null = null
  let disposed = false

  const stopIdentityObservation = owner.subscribeIdentityChange(() => {
    devtoolsSink?.clearIdentityOwned()
  })

  owner.addDisposer(() => {
    disposed = true
    stopIdentityObservation()
    devtoolsSink?.dispose()
    devtoolsSink = null
  })

  const context: ConvexRuntimeContext = {
    owner,
    logger,
    getAuthCoordinator: () => authCoordinator,
    attachAuthCoordinator(coordinator) {
      if (authCoordinator && authCoordinator !== coordinator) {
        throw new Error('[convex-runtime] auth coordinator is already attached')
      }
      authCoordinator = coordinator
    },
    getDevtoolsSink: () => devtoolsSink,
    attachDevtoolsSink(sink) {
      if (disposed) {
        sink.dispose()
        return null
      }
      devtoolsSink?.dispose()
      devtoolsSink = sink
      return () => {
        if (devtoolsSink !== sink) return
        devtoolsSink = null
        sink.dispose()
      }
    },
  }
  return Object.freeze(context)
}
