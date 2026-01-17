import type { FunctionReference } from 'convex/server'
import { hash } from 'ohash'
import type { ConvexUser } from './types'

// Convex stores function names using this Symbol
const functionNameSymbol = Symbol.for('functionName')

// ============================================================================
// JWT Decoding (Unified Implementation)
// ============================================================================

/**
 * Decode a base64url-encoded string.
 * Works in both browser (atob) and Node.js (Buffer) environments.
 * Handles URL-safe base64 encoding (RFC 4648).
 */
function base64UrlDecode(str: string): string {
  // Convert URL-safe base64 to standard base64
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')

  // Use Buffer in Node.js, atob in browser
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8')
  }
  return atob(base64)
}

/**
 * Decode JWT payload without verification.
 * Returns the parsed payload object or null if decoding fails.
 *
 * @param token - The JWT token string
 * @returns The decoded payload object or null
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = parts[1]
    if (!payload) return null

    const decoded = base64UrlDecode(payload)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * Decode user info from JWT payload.
 * Extracts standard user fields from the JWT claims.
 *
 * @param token - The JWT token string
 * @returns The decoded user or null if decoding fails
 */
export function decodeUserFromJwt(token: string): ConvexUser | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null

  // Check for required identifiers
  if (!payload.sub && !payload.userId && !payload.email) {
    return null
  }

  return {
    id: String(payload.sub || payload.userId || ''),
    name: String(payload.name || ''),
    email: String(payload.email || ''),
    emailVerified: typeof payload.emailVerified === 'boolean' ? payload.emailVerified : undefined,
    image: typeof payload.image === 'string' ? payload.image : undefined,
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Query status representing the current state of the query
 */
export type QueryStatus = 'idle' | 'pending' | 'success' | 'error'

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse Convex response, handling both success and error formats.
 *
 * Success formats:
 * - { value: T, status: 'success' }
 * - { value: T }
 * - T (direct value for primitives)
 *
 * Error formats:
 * - { status: 'error', errorMessage: string }
 * - { code: string, message: string }
 */
export function parseConvexResponse<T>(response: unknown): T {
  // Check for error response
  if (response && typeof response === 'object') {
    const resp = response as Record<string, unknown>
    if (resp.status === 'error' || resp.code) {
      const message = (resp.errorMessage || resp.message || 'Query failed') as string
      throw new Error(message)
    }
    // Check for value wrapper
    if ('value' in resp) {
      return resp.value as T
    }
  }
  // Direct value (shouldn't happen with Convex, but handle gracefully)
  return response as T
}

// ============================================================================
// Query Status
// ============================================================================

/**
 * Status computation logic for queries.
 *
 * Priority order:
 * 1. Skip -> idle (always)
 * 2. Error -> error (takes precedence over pending)
 * 3. Pending without data -> pending
 * 4. Everything else -> success (including pending with data for background refresh)
 */
export function computeQueryStatus(
  isSkipped: boolean,
  hasError: boolean,
  isPending: boolean,
  hasData: boolean,
): QueryStatus {
  if (isSkipped) return 'idle'
  if (hasError) return 'error'
  if (isPending && !hasData) return 'pending'
  return 'success'
}

// ============================================================================
// Function Name Extraction
// ============================================================================

/**
 * Get the function name from a Convex function reference.
 * Works with queries, mutations, and actions.
 */
export function getFunctionName(
  fn: FunctionReference<'query'> | FunctionReference<'mutation'> | FunctionReference<'action'>,
): string {
  if (!fn) return 'unknown'

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = fn as any

    // Convex uses Symbol.for('functionName') to store the path
    const symbolName = q[functionNameSymbol]
    if (typeof symbolName === 'string') return symbolName

    // Fallback: check for _path (used in tests/mocks)
    if (typeof q._path === 'string') return q._path

    // Fallback: check for functionPath
    if (typeof q.functionPath === 'string') return q.functionPath

    // Fallback: if it's already a string
    if (typeof q === 'string') return q

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate a stable hash for any value using ohash.
 * Used for cache key generation and argument comparison.
 *
 * Benefits over custom stableStringify:
 * - Handles circular references gracefully
 * - Faster execution (optimized C++ implementation)
 * - Shorter, URL-safe output
 * - Handles Symbols, Functions, and edge cases
 */
export function hashArgs(args: unknown): string {
  return hash(args ?? {})
}

/**
 * Generate a unique cache key for a query + args combination
 */
export function getQueryKey(query: FunctionReference<'query'>, args?: unknown): string {
  const fnName = getFunctionName(query)
  return `convex:${fnName}:${hashArgs(args)}`
}

