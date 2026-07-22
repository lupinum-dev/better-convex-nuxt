import { useConvexConnectionState as useVueConvexConnectionState } from 'better-convex-vue'
import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'

export type { ConnectionState } from 'convex/browser'

/** Nuxt hydration-safe presentation around the shared Vue connection store. */
export function useConvexConnectionState() {
  const connection = useVueConvexConnectionState()
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
