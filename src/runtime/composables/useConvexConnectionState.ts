import type { ConnectionState } from 'convex/browser'
import { ref, computed, onMounted, onScopeDispose, getCurrentScope } from 'vue'

import { useNuxtApp } from '#imports'

import { readConvexRuntimeContext } from '../runtime-context'

// Re-export for convenience — convex/browser is the single source of truth.
export type { ConnectionState } from 'convex/browser'

const DISCONNECTED_CONNECTION_STATE: Readonly<ConnectionState> = Object.freeze({
  hasInflightRequests: false,
  isWebSocketConnected: false,
  timeOfOldestInflightRequest: null,
  hasEverConnected: false,
  connectionCount: 0,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
})

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
  const owner = import.meta.client ? readConvexRuntimeContext(nuxtApp)?.owner : undefined
  const currentScope = getCurrentScope()
  const mounted = ref(false)

  // Always expose the disconnected snapshot during SSR and the initial client
  // render. Reading the owner store only after mount prevents connection timing
  // from changing hydration output.
  const state = computed<Readonly<ConnectionState>>(() =>
    mounted.value && owner ? owner.connection.state.value : DISCONNECTED_CONNECTION_STATE,
  )

  if (import.meta.client && owner && currentScope) {
    let removeConsumer: (() => void) | null = null
    // Subscribe after hydration so the first client render matches the static
    // disconnected SSR snapshot. The owner still shares one underlying
    // subscription and rebinds it across primary replacement.
    onMounted(() => {
      removeConsumer = owner.connection.addConsumer()
      mounted.value = true
    })
    onScopeDispose(() => removeConsumer?.())
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
