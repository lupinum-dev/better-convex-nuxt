import type { FunctionReference } from 'convex/server'

// Convex stores function names using this Symbol
const functionNameSymbol = Symbol.for('functionName')

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
 * Stable stringify for cache key generation.
 * Handles arrays, nested objects, null, undefined correctly.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj !== 'object') return JSON.stringify(obj)

  if (Array.isArray(obj)) {
    // Don't double-stringify: recursively stringify items then join
    return '[' + obj.map((item) => stableStringify(item)).join(',') + ']'
  }

  // Sort object keys for stable ordering
  const record = obj as Record<string, unknown>
  const sortedKeys = Object.keys(record).sort()
  const pairs = sortedKeys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return '{' + pairs.join(',') + '}'
}

/**
 * Generate a unique cache key for a query + args combination
 */
export function getQueryKey(query: FunctionReference<'query'>, args?: unknown): string {
  const fnName = getFunctionName(query)
  const argsKey = stableStringify(args ?? {})
  return `convex:${fnName}:${argsKey}`
}

