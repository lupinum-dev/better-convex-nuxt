/**
 * DevTools bridge setup for the Nuxt DevTools integration.
 *
 * This module sets up the communication bridge between the main window
 * and the DevTools iframe using BroadcastChannel.
 */

import { toRaw } from 'vue'
import type { ConvexClient } from 'convex/browser'
import type { Ref } from 'vue'
import type {
  ConvexDevToolsBridge,
  ConvexUser,
  JWTClaims,
  EnhancedAuthState,
  AuthState,
  AuthWaterfall,
} from './types'

/**
 * Setup the DevTools bridge on the window object.
 * Only called in dev mode from plugin.client.ts.
 *
 * @param client - The Convex WebSocket client
 * @param convexToken - Ref to the current auth token
 * @param convexUser - Ref to the current user data
 * @param convexAuthWaterfall - Ref to the SSR auth waterfall timing data
 */
export async function setupDevToolsBridge(
  client: ConvexClient,
  convexToken: Ref<string | null>,
  convexUser: Ref<unknown>,
  convexAuthWaterfall: Ref<AuthWaterfall | null>,
): Promise<void> {
  // Dynamically import DevTools modules to avoid bundling in production
  const [queryRegistry, mutationRegistry, convexShared] = await Promise.all([
    import('./query-registry'),
    import('./mutation-registry'),
    import('../utils/convex-shared'),
  ])

  // Use shared JWT decoder
  const decodeJWT = (token: string): JWTClaims | null => {
    return convexShared.decodeJwtPayload(token) as JWTClaims | null
  }

  const bridge: ConvexDevToolsBridge = {
    version: '1.1.0',

    getQueries: () => queryRegistry.getActiveQueries(),

    getQueryDetail: (id: string) => queryRegistry.getQuery(id),

    subscribeToQueries: (callback) => queryRegistry.subscribeToQueries(callback),

    getMutations: () => mutationRegistry.getMutations(),

    subscribeToMutations: (callback) => mutationRegistry.subscribeToMutations(callback),

    getAuthState: (): AuthState => {
      // Use toRaw to unwrap Vue proxy (BroadcastChannel can't clone proxies)
      const rawUser = toRaw(convexUser.value) as ConvexUser | null
      const hasToken = !!convexToken.value
      // Check for valid user by looking for required fields (more stable than Object.keys().length)
      // Object.keys() on Vue proxies can be unreliable and cause flickering
      const hasUser = !!(rawUser && typeof rawUser === 'object' && (rawUser.id || rawUser.email))
      // Create a plain object copy to avoid proxy cloning issues
      const plainUser = hasUser ? JSON.parse(JSON.stringify(rawUser)) : null

      return {
        isAuthenticated: !!(hasToken && hasUser),
        isPending: false, // Could be enhanced to track pending state
        user: plainUser,
        tokenStatus: hasToken ? 'valid' : 'none',
      }
    },

    getEnhancedAuthState: (): EnhancedAuthState => {
      const baseState = bridge.getAuthState()
      const token = convexToken.value

      if (!token) {
        return {
          ...baseState,
          claims: undefined,
          issuedAt: undefined,
          expiresAt: undefined,
          expiresInSeconds: undefined,
        }
      }

      const claims = decodeJWT(token)
      const now = Math.floor(Date.now() / 1000)
      const expiresAt = claims?.exp
      const expiresInSeconds = expiresAt ? Math.max(0, expiresAt - now) : undefined

      return {
        ...baseState,
        claims: claims ?? undefined,
        issuedAt: claims?.iat ? claims.iat * 1000 : undefined,
        expiresAt: expiresAt ? expiresAt * 1000 : undefined,
        expiresInSeconds,
      }
    },

    getConnectionState: () => {
      // Get connection state from the Convex client
      const state = client.connectionState()
      return {
        isConnected: state.isWebSocketConnected,
        hasEverConnected: state.hasInflightRequests || state.isWebSocketConnected,
        connectionRetries: 0, // Not exposed by Convex client
        inflightRequests: state.hasInflightRequests ? 1 : 0, // Simplified
      }
    },

    getAuthWaterfall: (): AuthWaterfall | null => {
      // Return the SSR auth waterfall timing data (hydrated from server)
      const waterfall = convexAuthWaterfall.value
      if (!waterfall) return null
      // Create a plain object copy to avoid proxy cloning issues
      return JSON.parse(JSON.stringify(toRaw(waterfall)))
    },
  }

  // Expose on window for direct access (same-origin)
  window.__CONVEX_DEVTOOLS__ = bridge

  // Generate a unique instance ID for this tab/window to prevent cross-tab interference
  const instanceId = Math.random().toString(36).slice(2, 10)

  // Use BroadcastChannel for reliable same-origin communication with DevTools iframe
  const channel = new BroadcastChannel('convex-devtools')

  // Handle messages from DevTools iframe via BroadcastChannel
  channel.onmessage = (event) => {
    const data = event.data
    if (!data || typeof data !== 'object') return

    if (data.type === 'CONVEX_DEVTOOLS_INIT') {
      // DevTools iframe is requesting connection
      channel.postMessage({ type: 'CONVEX_DEVTOOLS_READY', instanceId })
    } else if (data.type === 'CONVEX_DEVTOOLS_REQUEST') {
      // DevTools iframe is calling a bridge method
      const { id, method, args } = data
      try {
        const bridgeMethod = bridge[method as keyof ConvexDevToolsBridge]
        if (typeof bridgeMethod === 'function') {
          const result = (bridgeMethod as (...args: unknown[]) => unknown)(...(args || []))
          channel.postMessage({ type: 'CONVEX_DEVTOOLS_RESPONSE', id, result, instanceId })
        } else if (bridgeMethod !== undefined) {
          // Property access
          channel.postMessage({ type: 'CONVEX_DEVTOOLS_RESPONSE', id, result: bridgeMethod, instanceId })
        } else {
          channel.postMessage({
            type: 'CONVEX_DEVTOOLS_RESPONSE',
            id,
            error: `Unknown method: ${method}`,
            instanceId,
          })
        }
      } catch (err) {
        channel.postMessage({
          type: 'CONVEX_DEVTOOLS_RESPONSE',
          id,
          error: err instanceof Error ? err.message : String(err),
          instanceId,
        })
      }
    }
  }

  // Subscribe to mutations and forward to DevTools via BroadcastChannel
  // Capture unsubscribe handle for HMR cleanup
  const unsubscribeMutations = mutationRegistry.subscribeToMutations((mutations) => {
    channel.postMessage({ type: 'CONVEX_DEVTOOLS_MUTATIONS', mutations, instanceId })
  })

  // Subscribe to queries and forward to DevTools via BroadcastChannel
  // Capture unsubscribe handle for HMR cleanup
  const unsubscribeQueries = queryRegistry.subscribeToQueries((queries) => {
    channel.postMessage({ type: 'CONVEX_DEVTOOLS_QUERIES', queries, instanceId })
  })

  // HMR cleanup: close the BroadcastChannel and unsubscribe when module is hot-replaced
  // This prevents ghost instances from responding to messages and subscription leaks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hot = (import.meta as any).hot
  if (hot) {
    hot.dispose(() => {
      unsubscribeMutations()
      unsubscribeQueries()
      channel.close()
    })
  }
}
