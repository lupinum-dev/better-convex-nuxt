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
import { createAppDevtoolsTransport, cloneDevtoolsPayload } from './transport'

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
  providedInstanceId?: string,
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
      const plainUser = hasUser ? cloneDevtoolsPayload(rawUser) : null

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
      return cloneDevtoolsPayload(toRaw(waterfall))
    },

    getAuthProxyStats: async () => {
      // Fetch auth proxy stats from the DevTools server endpoint
      // The proxy runs on the Nitro server, so we need to poll the endpoint
      try {
        const response = await fetch('/__convex_devtools__/proxy-stats')
        if (!response.ok) return null
        return await response.json()
      } catch {
        return null
      }
    },
  }

  // Expose on window for direct access (same-origin)
  window.__CONVEX_DEVTOOLS__ = bridge

  // Generate a unique instance ID for this tab/window to prevent cross-tab interference
  const instanceId = providedInstanceId ?? Math.random().toString(36).slice(2, 10)
  const transport = createAppDevtoolsTransport('convex-devtools')

  // Handle messages from DevTools iframe via transport (BroadcastChannel or postMessage fallback)
  const onMessage = (event: { data: unknown }) => {
    const data = event.data
    if (!data || typeof data !== 'object') return

    const message = data as {
      type?: string
      id?: number
      method?: string
      args?: unknown[]
      instanceId?: string | null
    }

    if (message.type === 'CONVEX_DEVTOOLS_INIT') {
      // DevTools iframe is requesting connection
      transport.postMessage({ type: 'CONVEX_DEVTOOLS_READY', instanceId, transport: transport.kind })
    } else if (message.type === 'CONVEX_DEVTOOLS_REQUEST') {
      if (message.instanceId && message.instanceId !== instanceId) {
        return
      }
      // DevTools iframe is calling a bridge method
      const { id, method, args } = message
      if (typeof id !== 'number' || typeof method !== 'string') {
        return
      }
      try {
        const bridgeMethod = bridge[method as keyof ConvexDevToolsBridge]
        if (typeof bridgeMethod === 'function') {
          Promise.resolve((bridgeMethod as (...args: unknown[]) => unknown)(...(args || [])))
            .then((result) => {
              transport.postMessage({
                type: 'CONVEX_DEVTOOLS_RESPONSE',
                id,
                result,
                instanceId,
                transport: transport.kind,
              })
            })
            .catch((err) => {
              transport.postMessage({
                type: 'CONVEX_DEVTOOLS_RESPONSE',
                id,
                error: err instanceof Error ? err.message : String(err),
                instanceId,
                transport: transport.kind,
              })
            })
        } else if (bridgeMethod !== undefined) {
          // Property access
          transport.postMessage({
            type: 'CONVEX_DEVTOOLS_RESPONSE',
            id,
            result: bridgeMethod,
            instanceId,
            transport: transport.kind,
          })
        } else {
          transport.postMessage({
            type: 'CONVEX_DEVTOOLS_RESPONSE',
            id,
            error: `Unknown method: ${method}`,
            instanceId,
            transport: transport.kind,
          })
        }
      } catch (err) {
        transport.postMessage({
          type: 'CONVEX_DEVTOOLS_RESPONSE',
          id,
          error: err instanceof Error ? err.message : String(err),
          instanceId,
          transport: transport.kind,
        })
      }
    }
  }
  transport.addEventListener('message', onMessage)

  // Subscribe to mutations and forward to DevTools via BroadcastChannel
  // Capture unsubscribe handle for HMR cleanup
  const unsubscribeMutations = mutationRegistry.subscribeToMutations((mutations) => {
    transport.postMessage({
      type: 'CONVEX_DEVTOOLS_MUTATIONS',
      mutations,
      instanceId,
      transport: transport.kind,
    })
  })

  // Subscribe to queries and forward to DevTools via BroadcastChannel
  // Capture unsubscribe handle for HMR cleanup
  const unsubscribeQueries = queryRegistry.subscribeToQueries((queries) => {
    transport.postMessage({
      type: 'CONVEX_DEVTOOLS_QUERIES',
      queries,
      instanceId,
      transport: transport.kind,
    })
  })

  // HMR cleanup: close the BroadcastChannel and unsubscribe when module is hot-replaced
  // This prevents ghost instances from responding to messages and subscription leaks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hot = (import.meta as any).hot
  if (hot) {
    hot.dispose(() => {
      unsubscribeMutations()
      unsubscribeQueries()
      transport.removeEventListener('message', onMessage)
      transport.close()
    })
  }
}
