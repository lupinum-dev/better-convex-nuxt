import type { ConvexAuthCoordinator } from '../auth/client-engine'

/**
 * Ensure the auth coordinator has reached initial settlement (and any refresh
 * that was already in flight) before a mutation/action dispatches. `ready()` is
 * a snapshot operation that never throws and never chases later work; the
 * primary's socket is paused until the token is confirmed, so a call issued after
 * this returns runs against a settled identity. A no-op when auth is disabled.
 */
export async function ensureConvexAuthReady(
  coordinator: ConvexAuthCoordinator | undefined,
  _source: 'useConvexAction' | 'useConvexMutation',
): Promise<void> {
  if (!coordinator) return
  await coordinator.ready()
}
