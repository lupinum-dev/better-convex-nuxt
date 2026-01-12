/**
 * DevTools types and interfaces.
 */
import type { LogEvent } from '../utils/logger'
import type { QueryRegistryEntry } from './query-registry'

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

export interface ConnectionState {
  isConnected: boolean
  hasEverConnected: boolean
  connectionRetries: number
  inflightRequests: number
}

export interface ConvexDevToolsBridge {
  /** Get all active queries */
  getQueries: () => QueryRegistryEntry[]
  /** Subscribe to query updates */
  subscribeToQueries: (callback: (queries: QueryRegistryEntry[]) => void) => () => void
  /** Get auth state */
  getAuthState: () => AuthState
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
