import type { ConvexClient } from 'convex/browser'
import type { Ref } from 'vue'

import type { AuthWaterfall } from '../utils/auth-debug'

/**
 * Lazily loads and sets up the DevTools bridge in dev mode only.
 * Uses the origin-scoped channel name to prevent cross-app interference.
 * Also exposes `window.__CONVEX_SUBSCRIPTIONS__()` for console debugging.
 */
export function setupDevtoolsBridgeIfDev(
  client: ConvexClient,
  convexToken: Ref<string | null>,
  convexUser: Ref<unknown>,
  convexAuthWaterfall: Ref<AuthWaterfall | null>,
  devtoolsInstanceId: string,
  nuxtApp: object,
): void {
  if (typeof window === 'undefined' || !import.meta.dev) return

  // Expose subscription cache for console inspection
  void import('../utils/convex-cache').then(({ getSubscriptionCache }) => {
    ;(window as unknown as Record<string, unknown>).__CONVEX_SUBSCRIPTIONS__ = () =>
      getSubscriptionCache(nuxtApp as Parameters<typeof getSubscriptionCache>[0])
  })

  void import('../devtools/bridge-setup').then(({ setupDevToolsBridge }) => {
    void setupDevToolsBridge(client, convexToken, convexUser, convexAuthWaterfall, devtoolsInstanceId)
  })
}
