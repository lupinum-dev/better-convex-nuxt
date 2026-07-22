import { useConvexConnectionState as useVueConvexConnectionState } from 'better-convex-vue'
import { computed, getCurrentScope, onScopeDispose, readonly, ref } from 'vue'

export type { ConnectionState } from 'convex/browser'

/** Nuxt hydration-safe presentation around the shared Vue connection store. */
export function useConvexConnectionState() {
  // The Better Convex Vue plugin is intentionally client-only in Nuxt. SSR
  // therefore renders the same deterministic disconnected shape that the
  // shared runtime uses before its first browser connection, without relaxing
  // plain Vue's fail-fast "plugin required" contract.
  const connection = import.meta.client
    ? useVueConvexConnectionState()
    : (() => {
        const state = readonly(
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
        return {
          state,
          isConnected: computed(() => false),
          isReconnecting: computed(() => false),
          pendingMutations: computed(() => 0),
          pendingActions: computed(() => 0),
        }
      })()
  const isHydratingConnection = ref(true)
  let timer: ReturnType<typeof setTimeout> | null = null
  if (import.meta.client) {
    timer = setTimeout(() => {
      isHydratingConnection.value = false
    }, 500)
  }
  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (timer) clearTimeout(timer)
    })
  }
  return {
    ...connection,
    shouldShowOfflineUi: computed(
      () => !connection.isConnected.value && !isHydratingConnection.value,
    ),
  }
}
