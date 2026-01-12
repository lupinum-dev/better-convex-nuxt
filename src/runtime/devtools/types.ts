/**
 * DevTools types and interfaces.
 */
import type { LogEvent } from '../utils/logger'
import type { QueryRegistryEntry } from './query-registry'

// ============================================================================
// Mutation Types
// ============================================================================

export type MutationState = 'optimistic' | 'pending' | 'success' | 'error'

export interface MutationEntry {
  /** Unique identifier (generated UUID) */
  id: string
  /** Function name (e.g., "api.notes.create") */
  name: string
  /** Operation type */
  type: 'mutation' | 'action'
  /** Operation arguments */
  args: unknown
  /** Current state in lifecycle */
  state: MutationState
  /** Whether this mutation has an optimistic update */
  hasOptimisticUpdate: boolean
  /** Timestamp when mutation was initiated */
  startedAt: number
  /** Timestamp when mutation settled (success/error) */
  settledAt?: number
  /** Duration in ms (settledAt - startedAt) */
  duration?: number
  /** Result data on success */
  result?: unknown
  /** Error message on failure */
  error?: string
}

// ============================================================================
// JWT and Auth Types
// ============================================================================

export interface JWTClaims {
  /** Subject (user ID) */
  sub?: string
  /** Issued at timestamp (seconds) */
  iat?: number
  /** Expiration timestamp (seconds) */
  exp?: number
  /** Issuer */
  iss?: string
  /** Audience */
  aud?: string | string[]
  /** Any additional claims */
  [key: string]: unknown
}

// ============================================================================
// User and Auth State Types
// ============================================================================

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
  /** Decoded JWT claims */
  claims?: JWTClaims
  /** Token issued at timestamp (ms) */
  issuedAt?: number
  /** Token expiration timestamp (ms) */
  expiresAt?: number
  /** Seconds until token expires */
  expiresInSeconds?: number
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
// DevTools Bridge Interface
// ============================================================================

export interface ConvexDevToolsBridge {
  /** Get all active queries */
  getQueries: () => QueryRegistryEntry[]
  /** Get a specific query by ID for detail view */
  getQueryDetail: (id: string) => QueryRegistryEntry | undefined
  /** Subscribe to query updates */
  subscribeToQueries: (callback: (queries: QueryRegistryEntry[]) => void) => () => void
  /** Get all mutation entries */
  getMutations: () => MutationEntry[]
  /** Subscribe to mutation updates */
  subscribeToMutations: (callback: (mutations: MutationEntry[]) => void) => () => void
  /** Get auth state */
  getAuthState: () => AuthState
  /** Get enhanced auth state with JWT claims */
  getEnhancedAuthState: () => EnhancedAuthState
  /** Get connection state */
  getConnectionState: () => ConnectionState
  /** Get recent events from buffer */
  getEvents: () => LogEvent[]
  /** Subscribe to real-time events */
  subscribeToEvents: (callback: (event: LogEvent) => void) => () => void
  /** Get the Convex Dashboard URL */
  getDashboardUrl: () => string | null
  /** Version of the bridge API */
  version: string
}

declare global {
  interface Window {
    __CONVEX_DEVTOOLS__?: ConvexDevToolsBridge
  }
}

export {}
