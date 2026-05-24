import type {
  AuthWaterfall,
  AuthWaterfallPhase,
  WaterfallPhaseResult,
} from '../auth/shared/auth-debug.js'
import type { TrellisDenialExplanation, TrellisObservationEvent } from '../observability/types.js'

export type { AuthWaterfall, AuthWaterfallPhase, WaterfallPhaseResult }

// ============================================================================
// Query Types
// ============================================================================

export type DevtoolsQueryStatus = 'pending' | 'success' | 'error' | 'idle'
export type DataSource = 'ssr' | 'websocket' | 'cache'

export interface QueryOptions {
  immediate: boolean
  server: boolean
  subscribe: boolean
  auth: 'auto' | 'none'
}

export interface QueryRegistryEntry {
  id: string
  name: string
  args: unknown
  status: DevtoolsQueryStatus
  dataSource: DataSource
  data: unknown
  error?: string
  lastUpdated: number
  hasSubscription: boolean
  updateCount: number
  options?: QueryOptions
}

// ============================================================================
// Mutation Types
// ============================================================================

export type MutationState = 'optimistic' | 'pending' | 'success' | 'error'

export interface MutationEntry {
  id: string
  name: string
  type: 'mutation' | 'action'
  args: unknown
  state: MutationState
  hasOptimisticUpdate: boolean
  startedAt: number
  settledAt?: number
  duration?: number
  result?: unknown
  error?: string
}

// ============================================================================
// Event Timeline Types
// ============================================================================

export type DevtoolsEventKind = 'query' | 'mutation' | 'action'
export type DevtoolsEventPhase =
  | 'subscribe'
  | 'update'
  | 'success'
  | 'error'
  | 'unsubscribe'
  | 'optimistic'
  | 'pending'
  | 'skip'
  | 'load-more'

export interface DevtoolsEvent {
  id: string
  timestamp: number
  kind: DevtoolsEventKind
  phase: DevtoolsEventPhase
  operationId: string
  name: string
  args?: unknown
  payload?: unknown
  error?: string
  reason?: string
  duration?: number
  dataSource?: DataSource
  meta?: Record<string, unknown>
}

// ============================================================================
// JWT and Auth Types
// ============================================================================

export interface JWTClaims {
  sub?: string
  iat?: number
  exp?: number
  iss?: string
  aud?: string | string[]
  [key: string]: unknown
}

export interface DevtoolsAuthSessionUser {
  displayName?: string | null
  email?: string | null
  emailVerified?: boolean
  avatarUrl?: string | null
}

export interface AuthState {
  isAuthenticated: boolean
  isPending: boolean
  sessionUser: DevtoolsAuthSessionUser | null
  tokenStatus: 'valid' | 'expired' | 'none' | 'unknown'
}

export interface EnhancedAuthState extends AuthState {
  claims?: JWTClaims
  issuedAt?: number
  expiresAt?: number
  expiresInSeconds?: number
}

export interface AccessContextState {
  queryName: string | null
  pending: boolean
  ready: boolean
  ctx: unknown | null
  inventory: string[]
  error: string | null
}

export interface AuthBootstrapState {
  mutationName: string | null
  pending: boolean
  ensured: boolean
  error: string | null
}

export interface DecisionTraceState {
  correlationId: string | null
  handler: string | null
  operation: string | null
  tool: string | null
  principalKind: string | null
  actorKind: string | null
  workspaceId: string | null
  lastEventName: TrellisObservationEvent['name'] | null
  lastEventStatus: TrellisObservationEvent['status'] | null
  denialExplanation: TrellisDenialExplanation | null
  events: TrellisObservationEvent[]
}

// ============================================================================
// Connection State Types
// ============================================================================

export interface DevtoolsConnectionState {
  isConnected: boolean
  hasEverConnected: boolean
  connectionRetries: number
  inflightRequests: number
}

// ============================================================================
// Auth Proxy Types
// ============================================================================

export interface AuthProxyRequest {
  id: string
  path: string
  method: string
  timestamp: number
  status?: number
  duration?: number
  success?: boolean
  error?: string
}

export interface AuthProxyStats {
  totalRequests: number
  successCount: number
  errorCount: number
  avgDuration: number
  recentRequests: AuthProxyRequest[]
}

// ============================================================================
// DevTools Snapshot & RPC Types
// ============================================================================

export interface ConvexDevtoolsSnapshot {
  queries: QueryRegistryEntry[]
  mutations: MutationEntry[]
  events: DevtoolsEvent[]
  observations: TrellisObservationEvent[]
  authState: EnhancedAuthState
  connectionState: DevtoolsConnectionState
  authWaterfall: AuthWaterfall | null
  accessContextState: AccessContextState
  authBootstrapState: AuthBootstrapState
  decisionTrace: DecisionTraceState | null
}

export interface ServerRpcFunctions {
  getAuthProxyStats(): Promise<AuthProxyStats | null>
  clearAuthProxyStats(): Promise<void>
}

export type ClientRpcFunctions = Record<string, never>
