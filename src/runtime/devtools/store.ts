/**
 * Unified client-side DevTools store.
 * Replaces query-registry, mutation-registry, and bridge-setup
 * with a single reactive store accessed by the DevTools iframe.
 */
import type { ConvexClient } from 'convex/browser'
import { toRaw } from 'vue'
import type { Ref } from 'vue'

import { decodeJwtPayload } from '../convex/shared/convex-shared.js'
import type { TrellisObservationEvent } from '../observability/types.js'
import type { AuthSessionUser as RuntimeAuthSessionUser } from '../utils/types.js'
import type {
  QueryRegistryEntry,
  MutationEntry,
  DevtoolsEvent,
  EnhancedAuthState,
  DevtoolsConnectionState,
  AuthWaterfall,
  AccessContextState,
  AuthBootstrapState,
  ConvexDevtoolsSnapshot,
  DevtoolsAuthSessionUser,
  JWTClaims,
  DecisionTraceState,
} from './types.js'

const MAX_MUTATIONS = 50
const MAX_EVENTS = 500
const MAX_OBSERVATIONS = 200

interface NuxtDevtoolsHost {
  revision: { value: number }
  hooks: { callHook: (name: string) => void }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function clonePayload<T>(value: T): T {
  try {
    return structuredClone(toRaw(value))
  } catch {
    // Fallback for non-cloneable values
    return JSON.parse(JSON.stringify(value))
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value) ?? 'null'
}

function areSerializedValuesEqual(previous: unknown, next: unknown): boolean {
  return stableStringify(previous) === stableStringify(next)
}

function toDevtoolsUser(user: RuntimeAuthSessionUser | null): DevtoolsAuthSessionUser | null {
  if (!user) return null
  return clonePayload(user)
}

export class ConvexDevtoolsStore {
  // --- Data ---
  readonly queries = new Map<string, QueryRegistryEntry>()
  readonly mutations = new Map<string, MutationEntry>()
  readonly events: DevtoolsEvent[] = []
  readonly observations: TrellisObservationEvent[] = []

  authState: EnhancedAuthState = {
    isAuthenticated: false,
    isPending: false,
    sessionUser: null,
    tokenStatus: 'none',
  }

  connectionState: DevtoolsConnectionState = {
    isConnected: false,
    hasEverConnected: false,
    connectionRetries: 0,
    inflightRequests: 0,
  }

  authWaterfall: AuthWaterfall | null = null

  accessContextState: AccessContextState = {
    queryName: null,
    pending: false,
    ready: false,
    ctx: null,
    inventory: [],
    error: null,
  }

  authBootstrapState: AuthBootstrapState = {
    mutationName: null,
    pending: false,
    ensured: false,
    error: null,
  }

  // --- Debounce ---
  private _bumpScheduled = false

  // =====================================================================
  // Query Operations
  // =====================================================================

  registerQuery(
    entry: Omit<QueryRegistryEntry, 'lastUpdated' | 'updateCount'> & { updateCount?: number },
  ): void {
    const existing = this.queries.get(entry.id)
    this.queries.set(entry.id, {
      ...entry,
      lastUpdated: Date.now(),
      updateCount: entry.updateCount ?? existing?.updateCount ?? 0,
    })
    this._notifyDevtools()
  }

  updateQueryStatus(
    id: string,
    update: Partial<
      Pick<QueryRegistryEntry, 'status' | 'data' | 'error' | 'dataSource' | 'hasSubscription'>
    >,
  ): void {
    const existing = this.queries.get(id)
    if (!existing) return

    this.queries.set(id, {
      ...existing,
      ...update,
      lastUpdated: Date.now(),
      updateCount:
        update.dataSource === 'websocket' ? existing.updateCount + 1 : existing.updateCount,
    })
    this._notifyDevtools()
  }

  unregisterQuery(id: string): void {
    this.queries.delete(id)
    this._notifyDevtools()
  }

  // =====================================================================
  // Mutation Operations
  // =====================================================================

  registerMutation(entry: Omit<MutationEntry, 'id'>): string {
    const id = generateId()
    this.mutations.set(id, { id, ...entry })
    this._evictMutationsIfNeeded()
    this._notifyDevtools()
    return id
  }

  updateMutationState(
    id: string,
    update: Partial<Pick<MutationEntry, 'state' | 'result' | 'error' | 'settledAt' | 'duration'>>,
  ): void {
    const existing = this.mutations.get(id)
    if (!existing) return
    this.mutations.set(id, { ...existing, ...update })
    this._notifyDevtools()
  }

  appendEvent(event: Omit<DevtoolsEvent, 'id' | 'timestamp'> & { timestamp?: number }): string {
    const id = generateId()
    this.events.push({
      ...clonePayload(event),
      id,
      timestamp: event.timestamp ?? Date.now(),
    })
    this._evictEventsIfNeeded()
    this._notifyDevtools()
    return id
  }

  // =====================================================================
  // Auth Operations
  // =====================================================================

  updateAuthState(
    convexToken: Ref<string | null>,
    convexUser: Ref<RuntimeAuthSessionUser | null>,
  ): void {
    const rawUser = toRaw(convexUser.value)
    const hasToken = !!convexToken.value
    const hasUser =
      !!rawUser &&
      typeof rawUser === 'object' &&
      (Boolean(rawUser.email) ||
        Boolean(rawUser.displayName) ||
        Boolean(rawUser.avatarUrl) ||
        typeof rawUser.emailVerified === 'boolean')
    const plainUser = hasUser ? toDevtoolsUser(rawUser) : null
    const token = convexToken.value

    let claims: JWTClaims | undefined
    let issuedAt: number | undefined
    let expiresAt: number | undefined
    let expiresInSeconds: number | undefined

    if (token) {
      const decoded = decodeJwtPayload(token) as JWTClaims | null
      if (decoded) {
        claims = decoded
        const now = Math.floor(Date.now() / 1000)
        issuedAt = decoded.iat ? decoded.iat * 1000 : undefined
        expiresAt = decoded.exp ? decoded.exp * 1000 : undefined
        expiresInSeconds = decoded.exp ? Math.max(0, decoded.exp - now) : undefined
      }
    }

    const nextAuthState: EnhancedAuthState = {
      isAuthenticated: !!(hasToken && hasUser),
      isPending: false,
      sessionUser: plainUser,
      tokenStatus: hasToken ? 'valid' : 'none',
      claims,
      issuedAt,
      expiresAt,
      expiresInSeconds,
    }
    if (areSerializedValuesEqual(this.authState, nextAuthState)) {
      return
    }
    this.authState = nextAuthState
    this._notifyDevtools()
  }

  updateConnectionState(client: ConvexClient): void {
    const state = client.connectionState() as {
      hasInflightRequests: boolean
      connectionRetries: number
      hasEverConnected: boolean
      isWebSocketConnected: boolean
      inflightActions?: number
      inflightMutations?: number
      pendingActions?: number
      pendingMutations?: number
    }
    const inflightRequests =
      (state.pendingActions ?? state.inflightActions ?? 0) > 0 ||
      (state.pendingMutations ?? state.inflightMutations ?? 0) > 0 ||
      state.hasInflightRequests
        ? 1
        : 0
    const hasEverConnected =
      this.connectionState.hasEverConnected || state.hasEverConnected || state.isWebSocketConnected

    const nextConnectionState: DevtoolsConnectionState = {
      isConnected: state.isWebSocketConnected,
      hasEverConnected,
      connectionRetries: state.connectionRetries,
      inflightRequests,
    }
    if (
      this.connectionState.isConnected === nextConnectionState.isConnected &&
      this.connectionState.hasEverConnected === nextConnectionState.hasEverConnected &&
      this.connectionState.connectionRetries === nextConnectionState.connectionRetries &&
      this.connectionState.inflightRequests === nextConnectionState.inflightRequests
    ) {
      return
    }
    this.connectionState = nextConnectionState
    this._notifyDevtools()
  }

  setAuthWaterfall(waterfall: AuthWaterfall | null): void {
    const nextWaterfall = waterfall ? clonePayload(toRaw(waterfall)) : null
    if (areSerializedValuesEqual(this.authWaterfall, nextWaterfall)) {
      return
    }
    this.authWaterfall = nextWaterfall
    this._notifyDevtools()
  }

  setAccessContextState(state: AccessContextState): void {
    const nextState = clonePayload(toRaw(state))
    if (areSerializedValuesEqual(this.accessContextState, nextState)) {
      return
    }
    this.accessContextState = nextState
    this._notifyDevtools()
  }

  setAuthBootstrapState(state: AuthBootstrapState): void {
    const nextState = clonePayload(toRaw(state))
    if (areSerializedValuesEqual(this.authBootstrapState, nextState)) {
      return
    }
    this.authBootstrapState = nextState
    this._notifyDevtools()
  }

  appendObservation(event: TrellisObservationEvent): void {
    this.observations.push(clonePayload(event))
    this._evictObservationsIfNeeded()
    this._notifyDevtools()
  }

  // =====================================================================
  // Snapshot (for iframe consumption)
  // =====================================================================

  getSnapshot(): ConvexDevtoolsSnapshot {
    return clonePayload({
      queries: Array.from(this.queries.values()),
      mutations: Array.from(this.mutations.values()).sort((a, b) => b.startedAt - a.startedAt),
      events: [...this.events],
      observations: [...this.observations],
      authState: this.authState,
      connectionState: this.connectionState,
      authWaterfall: this.authWaterfall,
      accessContextState: this.accessContextState,
      authBootstrapState: this.authBootstrapState,
      decisionTrace: this._buildDecisionTrace(),
    })
  }

  // =====================================================================
  // Private
  // =====================================================================

  private _evictMutationsIfNeeded(): void {
    if (this.mutations.size <= MAX_MUTATIONS) return
    const sorted = Array.from(this.mutations.entries()).sort(
      (a, b) => a[1].startedAt - b[1].startedAt,
    )
    const toRemove = sorted.slice(0, this.mutations.size - MAX_MUTATIONS)
    for (const [id] of toRemove) {
      this.mutations.delete(id)
    }
  }

  private _evictEventsIfNeeded(): void {
    if (this.events.length <= MAX_EVENTS) return
    this.events.splice(0, this.events.length - MAX_EVENTS)
  }

  private _evictObservationsIfNeeded(): void {
    if (this.observations.length <= MAX_OBSERVATIONS) return
    this.observations.splice(0, this.observations.length - MAX_OBSERVATIONS)
  }

  private _buildDecisionTrace(): DecisionTraceState | null {
    if (this.observations.length === 0) return null

    const latest = this.observations.at(-1)
    if (!latest) return null

    const correlationId = latest.correlationId
    const traceEvents = correlationId
      ? this.observations.filter((event) => event.correlationId === correlationId)
      : [latest]
    const terminal =
      [...traceEvents]
        .reverse()
        .find((event) => event.status === 'deny' || event.status === 'error') ?? latest
    const explanation = terminal.details?.explanation ?? null

    return {
      correlationId: correlationId ?? null,
      handler: terminal.handler ?? latest.handler ?? null,
      operation: terminal.operation ?? latest.operation ?? null,
      tool: terminal.tool ?? latest.tool ?? null,
      principalKind: terminal.principalKind ?? latest.principalKind ?? null,
      actorKind: terminal.actorKind ?? latest.actorKind ?? null,
      workspaceId: terminal.workspaceId ?? latest.workspaceId ?? null,
      lastEventName: terminal.name,
      lastEventStatus: terminal.status,
      denialExplanation: explanation,
      events: traceEvents,
    }
  }

  private _notifyDevtools(): void {
    if (this._bumpScheduled) return
    this._bumpScheduled = true
    queueMicrotask(() => {
      this._bumpScheduled = false
      const host = (
        globalThis as typeof globalThis & {
          __NUXT_DEVTOOLS_HOST__?: NuxtDevtoolsHost
        }
      ).__NUXT_DEVTOOLS_HOST__
      if (host) {
        host.revision.value++
      }
    })
  }
}
