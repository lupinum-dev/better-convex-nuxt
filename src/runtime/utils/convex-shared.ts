import type { FunctionArgs, FunctionReference } from 'convex/server'
import { hash } from 'ohash'

import type { ConvexCallStatus, ConvexUser } from './types'

// Convex stores function names using this Symbol
const functionNameSymbol = Symbol.for('functionName')

// ============================================================================
// JWT Decoding (Unified Implementation)
// ============================================================================

/**
 * Decode a base64url-encoded string.
 * Works in both browser (atob) and Node.js (Buffer) environments.
 * Handles URL-safe base64 encoding (RFC 4648) with proper UTF-8 support.
 */
function base64UrlDecode(str: string): string {
  // Convert URL-safe base64 to standard base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')

  // Add padding if needed
  const padding = base64.length % 4
  if (padding > 0) {
    base64 += '='.repeat(4 - padding)
  }

  // Use Buffer in Node.js, atob + TextDecoder in browser
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8')
  }

  // Browser: proper UTF-8 decode (atob alone corrupts multi-byte characters)
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new TextDecoder('utf-8').decode(bytes)
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
 * Returns milliseconds until JWT expiry, or null when `exp` is missing/invalid.
 * Negative values mean the token is already expired.
 */
export function getJwtTimeUntilExpiryMs(token: string, nowMs = Date.now()): number | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  const exp = payload.exp
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
  return exp * 1000 - nowMs
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

  const user = {
    id: String(payload.sub || payload.userId || ''),
    name: String(payload.name || ''),
    email: String(payload.email || ''),
    emailVerified: typeof payload.emailVerified === 'boolean' ? payload.emailVerified : undefined,
    image: typeof payload.image === 'string' ? payload.image : undefined,
  }

  if (!user.id) {
    return null
  }

  // Preserve custom claims for consumers who augment ConvexUser.
  // Skip standard JWT claims and the normalized fields we already mapped above.
  for (const [key, value] of Object.entries(payload)) {
    if (
      key === 'sub' ||
      key === 'userId' ||
      key === 'name' ||
      key === 'email' ||
      key === 'emailVerified' ||
      key === 'image' ||
      key === 'iss' ||
      key === 'aud' ||
      key === 'exp' ||
      key === 'nbf' ||
      key === 'iat' ||
      key === 'jti'
    ) {
      continue
    }

    // Claims are JSON-safe values from JWT payload; attach as-is for augmented types.
    ;(user as Record<string, unknown>)[key] = value
  }

  return user as ConvexUser
}

export function normalizeConvexUser(input: unknown): ConvexUser | null {
  if (!input || typeof input !== 'object') return null

  const value = input as Record<string, unknown>
  const id = value.id
  if (typeof id !== 'string' || id.length === 0) return null

  return {
    ...value,
    id,
    name: typeof value.name === 'string' || value.name === null ? value.name : undefined,
    email: typeof value.email === 'string' || value.email === null ? value.email : undefined,
    emailVerified: typeof value.emailVerified === 'boolean' ? value.emailVerified : undefined,
    image: typeof value.image === 'string' || value.image === null ? value.image : undefined,
    createdAt:
      typeof value.createdAt === 'string' || value.createdAt instanceof Date
        ? value.createdAt
        : undefined,
    updatedAt:
      typeof value.updatedAt === 'string' || value.updatedAt instanceof Date
        ? value.updatedAt
        : undefined,
  } as ConvexUser
}

// ============================================================================
// Types
// ============================================================================

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
 * Error format (the Convex HTTP API's actual contract):
 * - { status: 'error', errorMessage: string }
 *
 * Only `status === 'error'` is treated as an error. A payload whose `value`
 * legitimately contains a `code` field (e.g. `{ status: 'success', value: {
 * code: 'x' } }`) must not be mistaken for an error response (F-33).
 */
export function parseConvexResponse<T>(response: unknown): T {
  // Check for error response
  if (response && typeof response === 'object') {
    const resp = response as Record<string, unknown>
    if (resp.status === 'error') {
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
): ConvexCallStatus {
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
    const value = fn as unknown
    if (typeof value === 'string') return value

    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
      return 'unknown'
    }

    const functionRef = value as Record<PropertyKey, unknown>

    // Convex uses Symbol.for('functionName') to store the path
    const symbolName = functionRef[functionNameSymbol]
    if (typeof symbolName === 'string') return symbolName

    // Fallback: check for _path (used in tests/mocks)
    if (typeof functionRef._path === 'string') return functionRef._path

    // Fallback: check for functionPath
    if (typeof functionRef.functionPath === 'string') return functionRef.functionPath

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
 * Build the identity-blind base key for a query + args combination (internal
 * §7.1). This is the `convex:<functionName>:<argsHash>` (or
 * `convex-paginated:<functionName>:<argsHash>`) prefix; the auth/identity
 * dimension is appended separately by {@link withAuthDimension} so the same base
 * can be partitioned per identity.
 *
 * Renamed from the deleted public `getQueryKey` (vNext §6): the base key is
 * library-internal and must never resurface as a public auto-import.
 */
export function createConvexQueryKey<Query extends FunctionReference<'query'>>(
  query: Query,
  args?: FunctionArgs<Query>,
  namespace: 'convex' | 'convex-paginated' = 'convex',
): string {
  const fnName = getFunctionName(query)
  return `${namespace}:${fnName}:${hashArgs(args)}`
}
