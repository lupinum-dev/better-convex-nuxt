import { ref, readonly, computed, onScopeDispose, type Ref } from 'vue'
import { useNuxtApp, useRuntimeConfig } from '#imports'

import { getSharedLogger, getLogLevel } from '../utils/logger'
import { useConvex } from './useConvex'

/**
 * Connection state from the Convex client
 */
export interface ConnectionState {
  /** Whether there are pending requests */
  hasInflightRequests: boolean
  /** Whether the WebSocket is currently connected */
  isWebSocketConnected: boolean
  /** Timestamp of the oldest pending request */
  timeOfOldestInflightRequest: Date | null
  /** Whether the client has ever successfully connected */
  hasEverConnected: boolean
  /** Number of successful connections */
  connectionCount: number
  /** Number of connection retry attempts */
  connectionRetries: number
  /** Number of pending mutations */
  inflightMutations: number
  /** Number of pending actions */
  inflightActions: number
}

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
  const client = useConvex()
  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = getSharedLogger(logLevel)
  const store = getConnectionStateStore(nuxtApp)

  // Only subscribe on client
  if (import.meta.client && client) {
    // First subscriber initializes the connection
    if (store.subscriberCount === 0) {
      // Get initial state
      store.state.value = client.connectionState() as ConnectionState

      // Subscribe to connection state changes (single subscription for all components)
      store.unsubscribe = client.subscribeToConnectionState((newState: ConnectionState) => {
        const currentState = store.state

        const wasConnected = currentState.value.isWebSocketConnected
        const nowConnected = newState.isWebSocketConnected

        if (wasConnected !== nowConnected) {
          if (nowConnected) {
            // Reconnected
            const offlineDuration = store.disconnectedAt ? Date.now() - store.disconnectedAt : undefined
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
  }

  // Computed shortcuts derived from shared state
  const state = store.state
  const isConnected = computed(() => state.value.isWebSocketConnected)
  const hasEverConnected = computed(() => state.value.hasEverConnected)
  const connectionRetries = computed(() => state.value.connectionRetries)
  const hasInflightRequests = computed(() => state.value.hasInflightRequests)
  const isReconnecting = computed(
    () => state.value.hasEverConnected && !state.value.isWebSocketConnected,
  )
  const inflightMutations = computed(() => state.value.inflightMutations)
  const inflightActions = computed(() => state.value.inflightActions)
  const isHydratingConnection = ref(true)
  let hydrationTimer: ReturnType<typeof setTimeout> | null = null
  if (import.meta.client) {
    hydrationTimer = setTimeout(() => {
      isHydratingConnection.value = false
    }, 500)
  } else {
    isHydratingConnection.value = false
  }

  onScopeDispose(() => {
    if (hydrationTimer) {
      clearTimeout(hydrationTimer)
      hydrationTimer = null
    }
  })

  const shouldShowOfflineUi = computed(
    () => !isConnected.value && !isHydratingConnection.value,
  )

  return {
    /** Full connection state object */
    state: readonly(state),
    /** Whether WebSocket is currently connected */
    isConnected,
    /** Whether client has ever successfully connected */
    hasEverConnected,
    /** Number of connection retry attempts */
    connectionRetries,
    /** Whether there are pending requests */
    hasInflightRequests,
    /** Whether client is reconnecting (was connected, now disconnected) */
    isReconnecting,
    /** Number of pending mutations */
    inflightMutations,
    /** Number of pending actions */
    inflightActions,
    /** Suppress offline UI during initial client hydration/connection grace window */
    isHydratingConnection: readonly(isHydratingConnection),
    /** Convenience flag for offline banners (already suppresses hydration flash) */
    shouldShowOfflineUi,
  }
}
