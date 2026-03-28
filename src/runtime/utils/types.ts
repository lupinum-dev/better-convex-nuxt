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

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Lifecycle status for query composables.
 * Queries start as 'pending' (no 'idle') and can be 'skipped' when args are null.
 */
export type QueryStatus = 'pending' | 'success' | 'error' | 'skipped'

/**
 * Lifecycle status for mutation and action composables.
 * Mutations start as 'idle' and cannot be 'skipped'.
 */
export type MutationStatus = 'idle' | 'pending' | 'success' | 'error'

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

// ============================================================================
// Error Types
// ============================================================================

/**
 * Semantic category for Convex errors.
 * Auto-derived from error code and HTTP status, or set explicitly.
 */
export type ConvexErrorCategory =
  | 'auth'
  | 'validation'
  | 'not_found'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'conflict'
  | 'scope_exceeded'
  | 'confirmation_required'
  | 'cooldown'
  | 'unknown'

/**
 * Operation type for MCP tool annotation derivation.
 */
export type ConvexToolOperation = 'query' | 'mutation' | 'action'

/**
 * A single field-level validation issue.
 * Populated when `category` is `'validation'` and the server returns structured issues.
 */
export interface ConvexErrorIssue {
  /** Dot-path to the invalid field (e.g. "address.zip"). */
  path?: string
  /** Human-readable error message. */
  message: string
  /** Machine-readable issue code. */
  code?: string
}

// ============================================================================
// Hook Payload Types
// ============================================================================

/**
 * Payload for `convex:mutation:success` and `convex:action:success` hooks.
 */
export interface ConvexCallSuccessPayload<T = unknown> {
  /** Convex function path (e.g. "posts:create"). */
  functionPath: string
  /** Whether this was a mutation or action. */
  operation: 'mutation' | 'action'
  /** The arguments passed to the call. */
  args: Record<string, unknown>
  /** The return value. */
  result: T
  /** Wall-clock duration in milliseconds. */
  duration: number
}

/**
 * Payload for `convex:mutation:error` and `convex:action:error` hooks.
 */
export interface ConvexCallErrorPayload {
  /** Convex function path (e.g. "posts:create"). */
  functionPath: string
  /** Whether this was a mutation or action. */
  operation: 'mutation' | 'action'
  /** The arguments passed to the call. */
  args: Record<string, unknown>
  /** The ConvexCallError instance. */
  error: import('./call-result').ConvexCallError
  /** Wall-clock duration in milliseconds. */
  duration: number
}
