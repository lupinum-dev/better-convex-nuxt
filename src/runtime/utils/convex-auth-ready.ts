import type { ConvexAuthEngine } from '../auth/client-engine'

export async function ensureConvexAuthReady(
  authEngine: ConvexAuthEngine | undefined,
  source: 'useConvexAction' | 'useConvexMutation',
): Promise<void> {
  if (!authEngine) return
  if (await authEngine.awaitAuthReady()) return

  await authEngine.refreshAuth()
  if (await authEngine.awaitAuthReady()) return

  throw new Error(`[${source}] Convex authentication is not ready`)
}
