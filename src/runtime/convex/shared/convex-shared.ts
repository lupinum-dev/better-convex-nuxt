import type {
  FunctionReference,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from 'convex/server'
import { hash } from 'ohash'

import { stripObservationEnvelope } from '../../observability/envelope.js'
import type { QueryStatus, AuthSessionUser } from '../../utils/types.js'

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
export function decodeUserFromJwt(token: string): AuthSessionUser | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  if (typeof payload !== 'object' || Array.isArray(payload)) return null

  if (!payload.sub && !payload.userId && !payload.email) {
    return null
  }

  const user: AuthSessionUser = {
    ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
    ...(typeof payload.name === 'string' ? { displayName: payload.name } : {}),
    ...(typeof payload.emailVerified === 'boolean' ? { emailVerified: payload.emailVerified } : {}),
    ...(typeof payload.picture === 'string'
      ? { avatarUrl: payload.picture }
      : typeof payload.image === 'string'
        ? { avatarUrl: payload.image }
        : {}),
  }

  return user
}

// ============================================================================
// Types
// ============================================================================

export type AnyQueryFunction =
  | FunctionReference<'query', 'public' | 'internal'>
  | RegisteredQuery<'public' | 'internal', Record<string, unknown>, unknown>

export type AnyMutationFunction =
  | FunctionReference<'mutation', 'public' | 'internal'>
  | RegisteredMutation<'public' | 'internal', Record<string, unknown>, unknown>

export type AnyActionFunction =
  | FunctionReference<'action', 'public' | 'internal'>
  | RegisteredAction<'public' | 'internal', Record<string, unknown>, unknown>

export type AnyConvexFunction = AnyQueryFunction | AnyMutationFunction | AnyActionFunction

export type FunctionLikeArgs<T> =
  T extends FunctionReference<infer _Kind, infer _Visibility, infer Args, infer _ReturnType>
    ? Args
    : T extends RegisteredQuery<infer _Visibility, infer Args, infer _ReturnType>
      ? Args
      : T extends RegisteredMutation<infer _Visibility, infer Args, infer _ReturnType>
        ? Args
        : T extends RegisteredAction<infer _Visibility, infer Args, infer _ReturnType>
          ? Args
          : never

export type FunctionLikeReturnType<T> =
  T extends FunctionReference<infer _Kind, infer _Visibility, infer _Args, infer ReturnType>
    ? ReturnType
    : T extends RegisteredQuery<infer _Visibility, infer _Args, infer ReturnType>
      ? ReturnType
      : T extends RegisteredMutation<infer _Visibility, infer _Args, infer ReturnType>
        ? ReturnType
        : T extends RegisteredAction<infer _Visibility, infer _Args, infer ReturnType>
          ? ReturnType
          : never

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
  if (isSkipped) return 'skipped'
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
  fn: AnyQueryFunction | AnyMutationFunction | AnyActionFunction,
): string {
  if (!fn) return 'unknown'

  try {
    const q = fn as Record<string | symbol, unknown>

    // Convex uses Symbol.for('functionName') to store the path
    const symbolName = q[functionNameSymbol]
    if (typeof symbolName === 'string') return symbolName

    // Fallback: check for _path (used in tests/mocks)
    if (typeof q._path === 'string') return q._path

    // Fallback: check for functionPath
    if (typeof q.functionPath === 'string') return q.functionPath

    // Fallback: if it's already a string
    if (typeof fn === 'string') return fn

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
  if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
    return hash(stripObservationEnvelope(args as Record<string, unknown>))
  }
  return hash(args ?? {})
}

/**
 * Generate a unique cache key for a query + args combination
 */
export function getQueryKey(query: FunctionReference<'query'>, args?: unknown): string {
  const fnName = getFunctionName(query)
  return `convex:${fnName}:${hashArgs(args)}`
}
