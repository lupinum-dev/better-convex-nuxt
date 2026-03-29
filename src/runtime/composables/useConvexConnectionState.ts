import type { ConvexClient } from 'convex/browser'
import { ref, readonly, computed, onScopeDispose, getCurrentScope } from 'vue'

import { useNuxtApp, useRuntimeConfig } from '#imports'

import {
  releaseSharedConnectionStateStore,
  syncConnectionStateSnapshot,
  useSharedConnectionStateStore,
} from '../client/runtime-hooks'
import { getSharedLogger, getLogLevel } from '../utils/logger'

export type { ConnectionState } from '../utils/types'

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
 * const { isConnected, isReconnecting, shouldShowOfflineUi } = useConvexConnectionState()
 * </script>
 *
 * <template>
 *   <div v-if="isReconnecting || shouldShowOfflineUi" class="offline-banner">Reconnecting...</div>
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
  const store = useSharedConnectionStateStore(nuxtApp, client, logger)

  // Only subscribe on client
  if (import.meta.client && client && currentScope) {
    store.subscriberCount++

    onScopeDispose(() => {
      store.subscriberCount--
      releaseSharedConnectionStateStore(nuxtApp)
    })
  } else if (import.meta.client && client && !currentScope) {
    syncConnectionStateSnapshot(nuxtApp, client)
  }

  // Computed shortcuts derived from shared state
  const state = store.state
  const isConnected = computed(() => state.value.isWebSocketConnected)
  const isReconnecting = computed(
    () => state.value.hasEverConnected && !state.value.isWebSocketConnected,
  )
  const pendingMutations = computed(() => state.value.inflightMutations)
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
    /** Convenience flag for offline banners (already suppresses hydration flash) */
    shouldShowOfflineUi,
  }
}
