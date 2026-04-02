import type { ConvexClient } from 'convex/browser'
import {
  computed,
  getCurrentInstance,
  getCurrentScope,
  onScopeDispose,
  onUnmounted,
  readonly,
  ref,
} from 'vue'

import { useNuxtApp, useRuntimeConfig } from '#imports'

import {
  getSharedConnectionStateStore,
  releaseSharedConnectionStateStore,
  syncConnectionStateSnapshot,
  useSharedConnectionStateStore,
} from '../../client/runtime-hooks'
import { getSharedLogger, getLogLevel } from '../../utils/logger'

export type { ConnectionState } from '../../utils/types'

export function useConvexConnectionState() {
  const nuxtApp = useNuxtApp()
  const client = import.meta.client ? (nuxtApp.$convex as ConvexClient | undefined) : undefined
  const currentScope = getCurrentScope()
  const currentInstance = getCurrentInstance()
  const hasLifecycleOwner = Boolean(currentScope || currentInstance)
  const config = useRuntimeConfig()
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = getSharedLogger(logLevel)
  const store =
    import.meta.client && client && hasLifecycleOwner
      ? useSharedConnectionStateStore(nuxtApp, client, logger)
      : getSharedConnectionStateStore(nuxtApp)

  if (import.meta.client && client && hasLifecycleOwner) {
    store.subscriberCount++

    const release = () => {
      store.subscriberCount--
      releaseSharedConnectionStateStore(nuxtApp)
    }

    if (currentScope) {
      onScopeDispose(release)
    } else {
      onUnmounted(release)
    }
  } else if (import.meta.client && client) {
    syncConnectionStateSnapshot(nuxtApp, client)
  }

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

  if (hasLifecycleOwner) {
    const clearHydrationTimer = () => {
      if (hydrationTimer) {
        clearTimeout(hydrationTimer)
        hydrationTimer = null
      }
    }

    if (currentScope) {
      onScopeDispose(clearHydrationTimer)
    } else {
      onUnmounted(clearHydrationTimer)
    }
  }

  const shouldShowOfflineUi = computed(() => !isConnected.value && !isHydratingConnection.value)

  return {
    state: readonly(state),
    isConnected,
    isReconnecting,
    pendingMutations,
    shouldShowOfflineUi,
  }
}
