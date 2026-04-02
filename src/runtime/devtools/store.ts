/**
 * Unified client-side DevTools store.
 * Replaces query-registry, mutation-registry, and bridge-setup
 * with a single reactive store accessed by the DevTools iframe.
 */
import type { ConvexClient } from 'convex/browser'
import { toRaw } from 'vue'
import type { Ref } from 'vue'

import { decodeJwtPayload } from '../utils/convex-shared'
import type {
  QueryRegistryEntry,
  MutationEntry,
  DevtoolsEvent,
  EnhancedAuthState,
  ConnectionState,
  AuthWaterfall,
  PermissionContextState,
  AuthBootstrapState,
  ConvexDevtoolsSnapshot,
  ConvexUser,
  JWTClaims,
} from './types'

const MAX_MUTATIONS = 50
const MAX_EVENTS = 500

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

export class ConvexDevtoolsStore {
  // --- Data ---
  readonly queries = new Map<string, QueryRegistryEntry>()
  readonly mutations = new Map<string, MutationEntry>()
  readonly events: DevtoolsEvent[] = []

  authState: EnhancedAuthState = {
    isAuthenticated: false,
    isPending: false,
    user: null,
    tokenStatus: 'none',
  }

  connectionState: ConnectionState = {
    isConnected: false,
    hasEverConnected: false,
    connectionRetries: 0,
    inflightRequests: 0,
  }

  authWaterfall: AuthWaterfall | null = null

  permissionContextState: PermissionContextState = {
    queryName: null,
    pending: false,
    ready: false,
    ctx: null,
    error: null,
  }

  authBootstrapState: AuthBootstrapState = {
    mutationName: null,
    pending: false,
    ensured: false,
    lastUserId: null,
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

  updateAuthState(convexToken: Ref<string | null>, convexUser: Ref<unknown>): void {
    const rawUser = toRaw(convexUser.value) as ConvexUser | null
    const hasToken = !!convexToken.value
    const hasUser = !!(rawUser && typeof rawUser === 'object' && (rawUser.id || rawUser.email))
    const plainUser = hasUser ? clonePayload(rawUser) : null
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

    this.authState = {
      isAuthenticated: !!(hasToken && hasUser),
      isPending: false,
      user: plainUser,
      tokenStatus: hasToken ? 'valid' : 'none',
      claims,
      issuedAt,
      expiresAt,
      expiresInSeconds,
    }
    this._notifyDevtools()
  }

  updateConnectionState(client: ConvexClient): void {
    const state = client.connectionState()
    const inflightRequests =
      state.inflightActions > 0 || state.inflightMutations > 0 || state.hasInflightRequests ? 1 : 0
    const hasEverConnected =
      this.connectionState.hasEverConnected || state.hasEverConnected || state.isWebSocketConnected

    this.connectionState = {
      isConnected: state.isWebSocketConnected,
      hasEverConnected,
      connectionRetries: state.connectionRetries,
      inflightRequests,
    }
    this._notifyDevtools()
  }

  setAuthWaterfall(waterfall: AuthWaterfall | null): void {
    this.authWaterfall = waterfall ? clonePayload(toRaw(waterfall)) : null
    this._notifyDevtools()
  }

  setPermissionContextState(state: PermissionContextState): void {
    this.permissionContextState = clonePayload(toRaw(state))
    this._notifyDevtools()
  }

  setAuthBootstrapState(state: AuthBootstrapState): void {
    this.authBootstrapState = clonePayload(toRaw(state))
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
      authState: this.authState,
      connectionState: this.connectionState,
      authWaterfall: this.authWaterfall,
      permissionContextState: this.permissionContextState,
      authBootstrapState: this.authBootstrapState,
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
