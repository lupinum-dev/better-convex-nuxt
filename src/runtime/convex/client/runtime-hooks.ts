/**
 * Connection state hooks for the Convex WebSocket client.
 *
 * One shared subscription per NuxtApp mirrors the Convex connection state into
 * Vue refs and emits `trellis:connection:changed` only when the derived phase changes.
 *
 * @module runtime-hooks
 */
import type { ConvexClient } from 'convex/browser'
import { ref, type Ref } from 'vue'

import type { RuntimeObserver } from '../../observability/runtime-observer.js'
import type {
  ConvexConnectionChangedPayload,
  ConvexConnectionPhase,
  ConnectionState,
} from '../../utils/types.js'

type RuntimeHookApp = object & {
  callHook(event: 'trellis:connection:changed', payload: ConvexConnectionChangedPayload): unknown
}

const DEFAULT_CONNECTION_STATE: ConnectionState = {
  hasInflightRequests: false,
  isWebSocketConnected: false,
  timeOfOldestInflightRequest: null,
  hasEverConnected: false,
  connectionCount: 0,
  connectionRetries: 0,
  pendingMutations: 0,
  pendingActions: 0,
}

interface ConnectionStateStore {
  state: Ref<ConnectionState>
  unsubscribe: (() => void) | null
  subscriberCount: number
  runtimeInitialized: boolean
  disconnectedAt: number | null
}

// Store on app object directly to survive Vite SSR module duplication with symlinked deps.
const CONNECTION_STATE_KEY = '__trellis_connection_state__' as const

function getConnectionStateStore(app: object): ConnectionStateStore {
  const store = app as Record<string, unknown>
  const existing = store[CONNECTION_STATE_KEY] as ConnectionStateStore | undefined
  if (existing) return existing

  const created: ConnectionStateStore = {
    state: ref<ConnectionState>({ ...DEFAULT_CONNECTION_STATE }),
    unsubscribe: null,
    subscriberCount: 0,
    runtimeInitialized: false,
    disconnectedAt: null,
  }
  store[CONNECTION_STATE_KEY] = created
  return created
}

function supportsConnectionHooks(client: ConvexClient | undefined): client is ConvexClient & {
  connectionState: () => {
    hasInflightRequests: boolean
    isWebSocketConnected: boolean
    timeOfOldestInflightRequest: Date | null
    hasEverConnected: boolean
    connectionCount: number
    connectionRetries: number
    inflightMutations?: number
    inflightActions?: number
    pendingMutations?: number
    pendingActions?: number
  }
  subscribeToConnectionState: (
    cb: (state: {
      hasInflightRequests: boolean
      isWebSocketConnected: boolean
      timeOfOldestInflightRequest: Date | null
      hasEverConnected: boolean
      connectionCount: number
      connectionRetries: number
      inflightMutations?: number
      inflightActions?: number
      pendingMutations?: number
      pendingActions?: number
    }) => void,
  ) => () => void
} {
  return Boolean(
    client &&
    typeof (client as ConvexClient & { connectionState?: unknown }).connectionState ===
      'function' &&
    typeof (client as ConvexClient & { subscribeToConnectionState?: unknown })
      .subscribeToConnectionState === 'function',
  )
}

function normalizeConnectionState(state: {
  hasInflightRequests: boolean
  isWebSocketConnected: boolean
  timeOfOldestInflightRequest: Date | null
  hasEverConnected: boolean
  connectionCount: number
  connectionRetries: number
  inflightMutations?: number
  inflightActions?: number
  pendingMutations?: number
  pendingActions?: number
}): ConnectionState {
  return {
    hasInflightRequests: state.hasInflightRequests,
    isWebSocketConnected: state.isWebSocketConnected,
    hasEverConnected: state.hasEverConnected,
    connectionCount: state.connectionCount,
    connectionRetries: state.connectionRetries,
    pendingMutations: state.pendingMutations ?? state.inflightMutations ?? 0,
    pendingActions: state.pendingActions ?? state.inflightActions ?? 0,
    timeOfOldestInflightRequest: state.timeOfOldestInflightRequest
      ? new Date(state.timeOfOldestInflightRequest)
      : null,
  }
}

export function getConnectionPhase(state: ConnectionState): ConvexConnectionPhase {
  if (state.isWebSocketConnected) return 'connected'
  if (state.hasEverConnected) return 'reconnecting'
  return 'connecting'
}

function handleConnectionStateChange(
  nuxtApp: RuntimeHookApp,
  store: ConnectionStateStore,
  logger: RuntimeObserver,
  nextState: ConnectionState,
) {
  const previousConnection = normalizeConnectionState({
    hasInflightRequests: store.state.value.hasInflightRequests,
    isWebSocketConnected: store.state.value.isWebSocketConnected,
    timeOfOldestInflightRequest: store.state.value.timeOfOldestInflightRequest,
    hasEverConnected: store.state.value.hasEverConnected,
    connectionCount: store.state.value.connectionCount,
    connectionRetries: store.state.value.connectionRetries,
    inflightMutations: store.state.value.pendingMutations,
    inflightActions: store.state.value.pendingActions,
  })
  const connection = nextState
  const previousState = getConnectionPhase(previousConnection)
  const state = getConnectionPhase(connection)

  const wasConnected = previousConnection.isWebSocketConnected
  const nowConnected = connection.isWebSocketConnected

  if (wasConnected !== nowConnected) {
    if (nowConnected) {
      const offlineDuration = store.disconnectedAt ? Date.now() - store.disconnectedAt : undefined
      logger.connection?.({ event: 'restored', offlineDuration })
      store.disconnectedAt = null
    } else {
      store.disconnectedAt = Date.now()
      logger.connection?.({ event: 'lost' })
    }
  }

  store.state.value = connection

  if (state === previousState) return

  const payload: ConvexConnectionChangedPayload = {
    state,
    previousState,
    connection,
    previousConnection,
  }
  // Hook handlers should never block connection state updates.
  void Promise.resolve(nuxtApp.callHook('trellis:connection:changed', payload)).catch(
    (error: unknown) => {
      console.error('[trellis] Error in trellis:connection:changed hook handler:', error)
    },
  )
}

function ensureConnectionSubscription(
  nuxtApp: RuntimeHookApp,
  client: ConvexClient | undefined,
  logger: RuntimeObserver,
): ConnectionStateStore {
  const store = getConnectionStateStore(nuxtApp)
  if (!import.meta.client || !supportsConnectionHooks(client)) {
    return store
  }

  if (store.unsubscribe) return store

  store.state.value = normalizeConnectionState(client.connectionState())
  store.unsubscribe = client.subscribeToConnectionState((newState) => {
    handleConnectionStateChange(nuxtApp, store, logger, normalizeConnectionState(newState))
  })

  return store
}

export function initRuntimeConnectionHooks(
  nuxtApp: RuntimeHookApp,
  client: ConvexClient | undefined,
  logger: RuntimeObserver,
) {
  const store = ensureConnectionSubscription(nuxtApp, client, logger)
  store.runtimeInitialized = true
}

export function useSharedConnectionStateStore(
  nuxtApp: RuntimeHookApp,
  client: ConvexClient | undefined,
  logger: RuntimeObserver,
): ConnectionStateStore {
  return ensureConnectionSubscription(nuxtApp, client, logger)
}

export function getSharedConnectionStateStore(nuxtApp: RuntimeHookApp): ConnectionStateStore {
  return getConnectionStateStore(nuxtApp)
}

export function releaseSharedConnectionStateStore(nuxtApp: RuntimeHookApp) {
  const store = getConnectionStateStore(nuxtApp)
  if (store.subscriberCount > 0 || store.runtimeInitialized || !store.unsubscribe) return

  store.unsubscribe()
  store.unsubscribe = null
}

export function syncConnectionStateSnapshot(
  nuxtApp: RuntimeHookApp,
  client: ConvexClient | undefined,
) {
  if (!import.meta.client || !supportsConnectionHooks(client)) return
  const store = getConnectionStateStore(nuxtApp)
  store.state.value = normalizeConnectionState(client.connectionState())
}
