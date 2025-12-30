import { ref, readonly, computed, onMounted, onUnmounted } from 'vue'

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
 * Options for useConvexConnectionState
 */
export interface UseConvexConnectionStateOptions {
  /**
   * Enable verbose logging for debugging.
   * Logs connection state changes.
   * @default false
   */
  verbose?: boolean
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
export function useConvexConnectionState(options?: UseConvexConnectionStateOptions) {
  const client = useConvex()
  const verbose = options?.verbose ?? false

  // Debug logger
  const log = verbose
    ? (message: string, data?: unknown) => {
        const prefix = '[useConvexConnectionState]: '
        if (data !== undefined) {
          console.log(prefix + message, data)
        } else {
          console.log(prefix + message)
        }
      }
    : () => {}

  log('Initialized', { hasClient: !!client, isClient: import.meta.client })

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
    log('Initial state', state.value)

    let unsubscribe: (() => void) | null = null

    onMounted(() => {
      log('Subscribing to connection state changes')
      // Subscribe to connection state changes
      unsubscribe = client.subscribeToConnectionState((newState: ConnectionState) => {
        const wasConnected = state.value.isWebSocketConnected
        const nowConnected = newState.isWebSocketConnected
        if (wasConnected !== nowConnected) {
          log(nowConnected ? 'Connected' : 'Disconnected', {
            retries: newState.connectionRetries,
            connectionCount: newState.connectionCount,
          })
        }
        state.value = newState
      })
    })

    onUnmounted(() => {
      log('Unsubscribing')
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
