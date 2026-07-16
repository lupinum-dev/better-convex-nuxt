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
  name?: string | null
  /** User's email address */
  email?: string | null
  /** Whether the email has been verified */
  emailVerified?: boolean
  /** URL to user's profile image */
  image?: string | null
  /** When the user account was created */
  createdAt?: string | Date
  /** When the user account was last updated */
  updatedAt?: string | Date
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Shared lifecycle status for query/mutation/action composables.
 */
export type ConvexCallStatus = 'idle' | 'pending' | 'success' | 'error'
