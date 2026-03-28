import type { ConvexClient } from 'convex/browser'
import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'

import type {
  ConnectionState,
  ConvexAuthChangedPayload,
  ConvexConnectionChangedPayload,
  ConvexConnectionPhase,
  ConvexUser,
} from '../utils/types'
import type { Logger } from '../utils/logger'

type RuntimeHookApp = object & {
  callHook: (...args: any[]) => Promise<unknown>
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

interface AuthSnapshot {
  isAuthenticated: boolean
  user: ConvexUser | null
  userId: string | null
}

interface AuthHookStore {
  initialized: boolean
  persistent: boolean
  snapshot: AuthSnapshot | null
  stop: (() => void) | null
  subscriberCount: number
}

const connectionStateStores = new WeakMap<object, ConnectionStateStore>()
const authHookStores = new WeakMap<object, AuthHookStore>()

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

function getAuthHookStore(app: object): AuthHookStore {
  const existing = authHookStores.get(app)
  if (existing) return existing

  const created: AuthHookStore = {
    initialized: false,
    persistent: false,
    snapshot: null,
    stop: null,
    subscriberCount: 0,
  }
  authHookStores.set(app, created)
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

function normalizeUser(user: unknown): ConvexUser | null {
  if (!user || typeof user !== 'object') return null
  const candidate = user as Partial<ConvexUser>
  return typeof candidate.id === 'string' ? (candidate as ConvexUser) : null
}

function buildAuthSnapshot(token: string | null, user: unknown): AuthSnapshot {
  const normalizedUser = normalizeUser(user)
  const isAuthenticated = Boolean(token && normalizedUser)

  return {
    isAuthenticated,
    user: isAuthenticated ? normalizedUser : null,
    userId: isAuthenticated ? normalizedUser!.id : null,
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

export function initRuntimeAuthHooks(
  nuxtApp: RuntimeHookApp,
  token: Ref<string | null>,
  user: Ref<unknown>,
) {
  if (!import.meta.client) return

  const store = getAuthHookStore(nuxtApp)
  const currentScope = getCurrentScope()
  const isPersistent = !currentScope

  if (currentScope) {
    store.subscriberCount++
    onScopeDispose(() => {
      store.subscriberCount--
      if (store.persistent || store.subscriberCount > 0) return

      store.stop?.()
      store.stop = null
      store.persistent = false
      store.snapshot = null
      store.initialized = false
    })
  }

  if (store.initialized) {
    if (isPersistent && !store.persistent) {
      store.stop?.()
      store.stop = null
      store.persistent = false
      store.snapshot = null
      store.initialized = false
    } else {
      return
    }
  }

  store.initialized = true
  store.persistent = isPersistent
  store.snapshot = buildAuthSnapshot(token.value, user.value)

  store.stop = watch(
    [() => token.value, () => user.value],
    ([nextToken, nextUser]) => {
      const previousSnapshot = store.snapshot ?? buildAuthSnapshot(null, null)
      const nextSnapshot = buildAuthSnapshot(nextToken, nextUser)

      const identityChanged =
        nextSnapshot.isAuthenticated !== previousSnapshot.isAuthenticated
        || nextSnapshot.userId !== previousSnapshot.userId

      if (!identityChanged) {
        store.snapshot = nextSnapshot
        return
      }

      store.snapshot = nextSnapshot

      const payload: ConvexAuthChangedPayload = {
        isAuthenticated: nextSnapshot.isAuthenticated,
        previousIsAuthenticated: previousSnapshot.isAuthenticated,
        user: nextSnapshot.user,
        previousUser: previousSnapshot.user,
      }
      void nuxtApp.callHook('convex:auth:changed', payload)
    },
    { flush: 'sync' },
  )
}
