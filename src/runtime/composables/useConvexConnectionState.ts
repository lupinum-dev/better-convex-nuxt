import { ref, readonly, computed, onScopeDispose, getCurrentScope } from 'vue'

import { useNuxtApp } from '#imports'

import type { ConvexClientOwner } from '../client/client-owner'

// Re-export for convenience — convex/browser is the single source of truth.
export type { ConnectionState } from 'convex/browser'

/**
 * Monitor the Convex WebSocket connection state (vNext §5.4).
 *
 * `connectionState` is deliberately NOT on the `useConvex()` handle; this is the
 * only connection-observation API. The connection store lives inside the per-app
 * client owner (internal §4.1 single ownership), so this composable observes the
 * CURRENT primary client through the owner: on primary-client replacement the
 * owner resets the store to its disconnected default and rebinds the
 * subscription to the replacement. Each mounted consumer registers with the
 * owner; the owner subscribes on the first consumer and unsubscribes on the last.
 *
 * @example
 * ```vue
 * <script setup>
 * const { isConnected, isReconnecting, connectionRetries } = useConvexConnectionState()
 * </script>
 * ```
 */
export function useConvexConnectionState() {
  const nuxtApp = useNuxtApp()
  const owner = import.meta.client
    ? (nuxtApp.$convexClientOwner as ConvexClientOwner | undefined)
    : undefined
  const currentScope = getCurrentScope()

  // The owner-owned connection state, or a static disconnected default on the
  // server / when no owner exists.
  const state = owner
    ? owner.connection.state
    : readonly(
        ref({
          hasInflightRequests: false,
          isWebSocketConnected: false,
          timeOfOldestInflightRequest: null,
          hasEverConnected: false,
          connectionCount: 0,
          connectionRetries: 0,
          inflightMutations: 0,
          inflightActions: 0,
        }),
      )

  if (import.meta.client && owner && currentScope) {
    // Register this scope as a connection consumer; the owner handles the single
    // underlying subscription and its rebinding across primary replacement.
    const removeConsumer = owner.connection.addConsumer()
    onScopeDispose(removeConsumer)
  }

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
    state,
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
