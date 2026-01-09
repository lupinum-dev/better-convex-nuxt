import { ref, readonly, computed, onMounted, onUnmounted } from 'vue'
import { useRuntimeConfig } from '#imports'

import { createModuleLogger, getLoggingOptions } from '../utils/logger'
import type { ConnectionChangeEvent } from '../utils/logger'
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

/**
 * Monitor the Convex WebSocket connection state.
 * Useful for showing offline/reconnecting UI.
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
  const loggingOptions = getLoggingOptions(config.public.convex ?? {})
  const logger = createModuleLogger(loggingOptions)

  // Track for logging
  let disconnectedAt: number | null = null

  // Initialize with disconnected state for SSR
  const state = ref<ConnectionState>({ ...DEFAULT_STATE })

  // Computed shortcuts
  const isConnected = computed(() => state.value.isWebSocketConnected)
  const hasEverConnected = computed(() => state.value.hasEverConnected)
  const connectionRetries = computed(() => state.value.connectionRetries)
  const hasInflightRequests = computed(() => state.value.hasInflightRequests)
  const isReconnecting = computed(
    () => state.value.hasEverConnected && !state.value.isWebSocketConnected,
  )
  const inflightMutations = computed(() => state.value.inflightMutations)
  const inflightActions = computed(() => state.value.inflightActions)

  // Only subscribe on client
  if (import.meta.client && client) {
    // Get initial state
    state.value = client.connectionState() as ConnectionState

    let unsubscribe: (() => void) | null = null

    onMounted(() => {
      // Subscribe to connection state changes
      unsubscribe = client.subscribeToConnectionState((newState: ConnectionState) => {
        const wasConnected = state.value.isWebSocketConnected
        const nowConnected = newState.isWebSocketConnected

        if (wasConnected !== nowConnected) {
          if (nowConnected) {
            // Reconnected
            const offlineDuration = disconnectedAt ? Date.now() - disconnectedAt : undefined
            logger.event({
              event: 'connection:change',
              from: 'disconnected',
              to: 'connected',
              retry_count: newState.connectionRetries,
              offline_duration_ms: offlineDuration,
            } satisfies ConnectionChangeEvent)
            disconnectedAt = null
          } else {
            // Disconnected
            disconnectedAt = Date.now()
            logger.event({
              event: 'connection:change',
              from: 'connected',
              to: 'disconnected',
              retry_count: newState.connectionRetries,
            } satisfies ConnectionChangeEvent)
          }
        }

        state.value = newState
      })
    })

    onUnmounted(() => {
      unsubscribe?.()
    })
  }

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
