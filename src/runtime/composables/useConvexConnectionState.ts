import { ref, readonly, computed, onUnmounted, type Ref } from 'vue'
import { useRuntimeConfig } from '#imports'

import { createLogger, getLogLevel } from '../utils/logger'
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

// Module-level singleton for shared connection state
// Uses ref-counting to manage the single ConvexClient subscription
// SAFETY: These module-level variables are only modified inside `if (import.meta.client)` blocks,
// so they won't leak between SSR requests. The singleton pattern prevents multiple
// WebSocket subscriptions when multiple components use this composable.
let sharedState: Ref<ConnectionState> | null = null
let sharedUnsubscribe: (() => void) | null = null
let subscriberCount = 0
let disconnectedAt: number | null = null

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
  const client = useConvex()
  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = createLogger(logLevel)

  // Initialize shared state if not already created
  if (!sharedState) {
    sharedState = ref<ConnectionState>({ ...DEFAULT_STATE })
  }

  // Only subscribe on client
  if (import.meta.client && client) {
    // First subscriber initializes the connection
    if (subscriberCount === 0) {
      // Get initial state
      sharedState.value = client.connectionState() as ConnectionState

      // Subscribe to connection state changes (single subscription for all components)
      sharedUnsubscribe = client.subscribeToConnectionState((newState: ConnectionState) => {
        if (!sharedState) return

        const wasConnected = sharedState.value.isWebSocketConnected
        const nowConnected = newState.isWebSocketConnected

        if (wasConnected !== nowConnected) {
          if (nowConnected) {
            // Reconnected
            const offlineDuration = disconnectedAt ? Date.now() - disconnectedAt : undefined
            logger.connection({ event: 'restored', offlineDuration })
            disconnectedAt = null
          } else {
            // Disconnected
            disconnectedAt = Date.now()
            logger.connection({ event: 'lost' })
          }
        }

        sharedState.value = newState
      })
    }

    // Increment subscriber count
    subscriberCount++

    // Decrement on unmount, cleanup when last subscriber leaves
    onUnmounted(() => {
      subscriberCount--
      if (subscriberCount === 0 && sharedUnsubscribe) {
        sharedUnsubscribe()
        sharedUnsubscribe = null
      }
    })
  }

  // Computed shortcuts derived from shared state
  const state = sharedState
  const isConnected = computed(() => state.value.isWebSocketConnected)
  const hasEverConnected = computed(() => state.value.hasEverConnected)
  const connectionRetries = computed(() => state.value.connectionRetries)
  const hasInflightRequests = computed(() => state.value.hasInflightRequests)
  const isReconnecting = computed(
    () => state.value.hasEverConnected && !state.value.isWebSocketConnected,
  )
  const inflightMutations = computed(() => state.value.inflightMutations)
  const inflightActions = computed(() => state.value.inflightActions)

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
  }
}
