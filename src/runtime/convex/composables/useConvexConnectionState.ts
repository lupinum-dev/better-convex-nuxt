import {
  useConvexConnectionState as useConvexConnectionStateRuntime,
  type ConnectionState,
} from '../client/connection-runtime.js'
export type { ConnectionState }

/**
 * Connection-state composable for app UI.
 *
 * Use this to drive offline banners, reconnect indicators, or "changes are
 * still syncing" affordances. It reflects the shared live Convex client state
 * rather than issuing any network requests itself.
 *
 * @example
 * ```ts
 * const { isConnected, isReconnecting, pendingMutations, shouldShowOfflineUi } =
 *   useConvexConnectionState()
 * ```
 */
export function useConvexConnectionState() {
  return useConvexConnectionStateRuntime()
}
