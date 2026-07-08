import type { ConnectionState, ConvexClient } from 'convex/browser'
import { ref, readonly, computed, onScopeDispose, getCurrentScope, type Ref } from 'vue'

import { useNuxtApp, useRuntimeConfig } from '#imports'

import { getSharedLogger, getLogLevel } from '../utils/logger'

// Re-export for convenience — consumers previously imported this type from
// here; convex/browser is now the single source of truth (F-36).
export type { ConnectionState } from 'convex/browser'

const DEFAULT_STATE: ConnectionState = {
  hasInflightRequests: false,
  isWebSocketConnected: false,
  timeOfOldestInflightRequest: null,
  hasEverConnected: false,
  connectionCount: 0,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
}

interface ConnectionStateStore {
  state: Ref<ConnectionState>
  unsubscribe: (() => void) | null
  subscriberCount: number
  disconnectedAt: number | null
}

const connectionStateStores = new WeakMap<object, ConnectionStateStore>()

function getConnectionStateStore(app: object): ConnectionStateStore {
  const existing = connectionStateStores.get(app)
  if (existing) return existing
  const created: ConnectionStateStore = {
    state: ref<ConnectionState>({ ...DEFAULT_STATE }),
    unsubscribe: null,
    subscriberCount: 0,
    disconnectedAt: null,
  }
  connectionStateStores.set(app, created)
  return created
}

/**
 * Monitor the Convex WebSocket connection state.
 * Useful for showing offline/reconnecting UI.
 *
 * Uses a singleton pattern to avoid creating multiple listeners
 * on the ConvexClient when multiple components use this composable.
 *
 * @example
 * ```vue
 * <script setup>
 * const { isConnected, isReconnecting, connectionRetries } = useConvexConnectionState()
 * </script>
 *
 * <template>
 *   <div v-if="isReconnecting" class="offline-banner">
 *     Reconnecting... (attempt {{ connectionRetries }})
 *   </div>
 * </template>
 * ```
 */
export function useConvexConnectionState() {
  const nuxtApp = useNuxtApp()
  const client = import.meta.client ? (nuxtApp.$convex as ConvexClient | undefined) : undefined
  const currentScope = getCurrentScope()
  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = getSharedLogger(logLevel)
  const store = getConnectionStateStore(nuxtApp)

  // Only subscribe on client
  if (import.meta.client && client && currentScope) {
    // First subscriber initializes the connection
    if (store.subscriberCount === 0) {
      // Get initial state
      store.state.value = client.connectionState()

      // Subscribe to connection state changes (single subscription for all components)
      store.unsubscribe = client.subscribeToConnectionState((newState) => {
        const currentState = store.state

        const wasConnected = currentState.value.isWebSocketConnected
        const nowConnected = newState.isWebSocketConnected

        if (wasConnected !== nowConnected) {
          if (nowConnected) {
            // Reconnected
            const offlineDuration = store.disconnectedAt
              ? Date.now() - store.disconnectedAt
              : undefined
            logger.connection({ event: 'restored', offlineDuration })
            store.disconnectedAt = null
          } else {
            // Disconnected
            store.disconnectedAt = Date.now()
            logger.connection({ event: 'lost' })
          }
        }

        currentState.value = newState
      })
    }

    // Increment subscriber count
    store.subscriberCount++

    // Decrement on unmount, cleanup when last subscriber leaves
    onScopeDispose(() => {
      store.subscriberCount--
      if (store.subscriberCount === 0 && store.unsubscribe) {
        store.unsubscribe()
        store.unsubscribe = null
      }
    })
  } else if (import.meta.client && client && !currentScope) {
    // Scope-less callers get a snapshot only to avoid leaking global subscriptions.
    store.state.value = client.connectionState()
  }

  // Computed shortcuts derived from shared state
  const state = store.state
  const isConnected = computed(() => state.value.isWebSocketConnected)
  const isReconnecting = computed(
    () => state.value.hasEverConnected && !state.value.isWebSocketConnected,
  )
  const pendingMutations = computed(() => state.value.inflightMutations)
  const pendingActions = computed(() => state.value.inflightActions)
  const isHydratingConnection = ref(true)
  let hydrationTimer: ReturnType<typeof setTimeout> | null = null
  if (import.meta.client) {
    hydrationTimer = setTimeout(() => {
      isHydratingConnection.value = false
    }, 500)
  } else {
    isHydratingConnection.value = false
  }

  if (currentScope) {
    onScopeDispose(() => {
      if (hydrationTimer) {
        clearTimeout(hydrationTimer)
        hydrationTimer = null
      }
    })
  }

  const shouldShowOfflineUi = computed(() => !isConnected.value && !isHydratingConnection.value)

  return {
    /** Full connection state object */
    state: readonly(state),
    /** Whether WebSocket is currently connected */
    isConnected,
    /** Whether client is reconnecting (was connected, now disconnected) */
    isReconnecting,
    /** Number of pending mutations */
    pendingMutations,
    /** Number of pending actions */
    pendingActions,
    /** Convenience flag for offline banners (already suppresses hydration flash) */
    shouldShowOfflineUi,
  }
}
