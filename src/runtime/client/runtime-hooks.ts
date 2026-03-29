import type { ConvexClient } from 'convex/browser'
import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'

import type {
  ConvexConnectionChangedPayload,
  ConvexConnectionPhase,
  ConnectionState,
} from '../utils/types'
import type { Logger } from '../utils/logger'

type RuntimeHookApp = object & {
  callHook(event: 'convex:connection:changed', payload: ConvexConnectionChangedPayload): Promise<unknown>
}

const DEFAULT_CONNECTION_STATE: ConnectionState = {
  hasInflightRequests: false,
  isWebSocketConnected: false,
  timeOfOldestInflightRequest: null,
  hasEverConnected: false,
  connectionCount: 0,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
}

interface ConnectionStateStore {
  state: Ref<ConnectionState>
  unsubscribe: (() => void) | null
  subscriberCount: number
  runtimeInitialized: boolean
  disconnectedAt: number | null
}

const connectionStateStores = new WeakMap<object, ConnectionStateStore>()

function getConnectionStateStore(app: object): ConnectionStateStore {
  const existing = connectionStateStores.get(app)
  if (existing) return existing

  const created: ConnectionStateStore = {
    state: ref<ConnectionState>({ ...DEFAULT_CONNECTION_STATE }),
    unsubscribe: null,
    subscriberCount: 0,
    runtimeInitialized: false,
    disconnectedAt: null,
  }
  connectionStateStores.set(app, created)
  return created
}

function supportsConnectionHooks(
  client: ConvexClient | undefined,
): client is ConvexClient & {
  connectionState: () => ConnectionState
  subscribeToConnectionState: (cb: (state: ConnectionState) => void) => () => void
} {
  return Boolean(
    client
      && typeof (client as ConvexClient & { connectionState?: unknown }).connectionState === 'function'
      && typeof (client as ConvexClient & { subscribeToConnectionState?: unknown }).subscribeToConnectionState === 'function',
  )
}

function cloneConnectionState(state: ConnectionState): ConnectionState {
  return {
    ...state,
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
  logger: Logger,
  nextState: ConnectionState,
) {
  const previousConnection = cloneConnectionState(store.state.value)
  const connection = cloneConnectionState(nextState)
  const previousState = getConnectionPhase(previousConnection)
  const state = getConnectionPhase(connection)

  const wasConnected = previousConnection.isWebSocketConnected
  const nowConnected = connection.isWebSocketConnected

  if (wasConnected !== nowConnected) {
    if (nowConnected) {
      const offlineDuration = store.disconnectedAt
        ? Date.now() - store.disconnectedAt
        : undefined
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
  void nuxtApp.callHook('convex:connection:changed', payload)
}

function ensureConnectionSubscription(
  nuxtApp: RuntimeHookApp,
  client: ConvexClient | undefined,
  logger: Logger,
): ConnectionStateStore {
  const store = getConnectionStateStore(nuxtApp)
  if (!import.meta.client || !supportsConnectionHooks(client)) {
    return store
  }

  if (store.unsubscribe) return store

  store.state.value = cloneConnectionState(client.connectionState())
  store.unsubscribe = client.subscribeToConnectionState((newState) => {
    handleConnectionStateChange(nuxtApp, store, logger, newState)
  })

  return store
}

export function initRuntimeConnectionHooks(
  nuxtApp: RuntimeHookApp,
  client: ConvexClient | undefined,
  logger: Logger,
) {
  const store = ensureConnectionSubscription(nuxtApp, client, logger)
  store.runtimeInitialized = true
}

export function useSharedConnectionStateStore(
  nuxtApp: RuntimeHookApp,
  client: ConvexClient | undefined,
  logger: Logger,
): ConnectionStateStore {
  return ensureConnectionSubscription(nuxtApp, client, logger)
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
  store.state.value = cloneConnectionState(client.connectionState())
}
