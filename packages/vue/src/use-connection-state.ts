import { computed, getCurrentScope, onMounted, onScopeDispose, ref } from 'vue'

import { useBetterConvexRuntime } from './runtime-context'

export function useConvexConnectionState() {
  const { browser } = useBetterConvexRuntime()
  const mounted = ref(false)
  let remove: (() => void) | null = null
  if (getCurrentScope()) {
    onMounted(() => {
      remove = browser.connection.addConsumer()
      mounted.value = true
    })
    onScopeDispose(() => remove?.())
  }
  const state = computed(() => browser.connection.state.value)
  return {
    state,
    isConnected: computed(() => mounted.value && state.value.isWebSocketConnected),
    isReconnecting: computed(
      () => mounted.value && state.value.hasEverConnected && !state.value.isWebSocketConnected,
    ),
    pendingMutations: computed(() => state.value.inflightMutations),
    pendingActions: computed(() => state.value.inflightActions),
  }
}
