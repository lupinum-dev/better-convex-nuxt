/**
 * Shared types used across the module
 *
 * Centralized type definitions to ensure consistency and avoid duplication.
 */

// ============================================================================
// User Types
// ============================================================================

/**
 * Authenticated user information from Better Auth / Convex JWT.
 * Used for both SSR hydration and client-side auth state.
 */
export interface ConvexUser {
  /** Unique user identifier */
  id: string
  /** User's display name */
  name: string
  /** User's email address */
  email: string
  /** Whether the email has been verified */
  emailVerified?: boolean
  /** URL to user's profile image */
  image?: string
  /** When the user account was created */
  createdAt?: string
  /** When the user account was last updated */
  updatedAt?: string
}

// ============================================================================
// Module Configuration Types
// ============================================================================

/**
 * Token cache configuration for client-side token validation.
 */
export interface TokenCacheConfig {
  /** Time-to-live in milliseconds for cached tokens */
  ttlMs: number
}

/**
 * Default token cache configuration
 */
export const DEFAULT_TOKEN_CACHE_TTL_MS = 10_000 // 10 seconds

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Shared lifecycle status for query/mutation/action composables.
 */
export type ConvexCallStatus = 'idle' | 'pending' | 'success' | 'error'

/**
 * Client-side auth mode for query composables.
 * - auto: attach token when available
 * - none: never attach auth token
 */
export type ConvexClientAuthMode = 'auto' | 'none'

/**
 * Server-side auth mode for server helper calls.
 */
export type ConvexServerAuthMode = 'auto' | 'required' | 'none'

/**
 * Make specific properties optional in a type
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * Extract the element type from an array type
 */
export type ArrayElement<T> = T extends readonly (infer E)[] ? E : never
