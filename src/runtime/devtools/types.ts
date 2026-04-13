import type {
  AuthWaterfall,
  AuthWaterfallPhase,
  WaterfallPhaseResult,
} from '../utils/auth-debug.js'

export type { AuthWaterfall, AuthWaterfallPhase, WaterfallPhaseResult }

// ============================================================================
// Query Types
// ============================================================================

export type QueryStatus = 'pending' | 'success' | 'error' | 'idle'
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
  status: QueryStatus
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

export interface ConvexUser {
  id: string
  name?: string | null
  email?: string | null
  emailVerified?: boolean
  image?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export interface AuthState {
  isAuthenticated: boolean
  isPending: boolean
  user: ConvexUser | null
  tokenStatus: 'valid' | 'expired' | 'none' | 'unknown'
}

export interface EnhancedAuthState extends AuthState {
  claims?: JWTClaims
  issuedAt?: number
  expiresAt?: number
  expiresInSeconds?: number
}

export interface PermissionContextState {
  queryName: string | null
  pending: boolean
  ready: boolean
  ctx: unknown | null
  error: string | null
}

export interface AuthBootstrapState {
  mutationName: string | null
  pending: boolean
  ensured: boolean
  lastUserId: string | null
  error: string | null
}

// ============================================================================
// Connection State Types
// ============================================================================

export interface ConnectionState {
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
  authState: EnhancedAuthState
  connectionState: ConnectionState
  authWaterfall: AuthWaterfall | null
  permissionContextState: PermissionContextState
  authBootstrapState: AuthBootstrapState
}

export interface ServerRpcFunctions {
  getAuthProxyStats(): Promise<AuthProxyStats | null>
  clearAuthProxyStats(): Promise<void>
}

export type ClientRpcFunctions = Record<string, never>
