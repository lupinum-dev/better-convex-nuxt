/**
 * Shared helper functions used across composables
 *
 * These utilities are extracted to avoid code duplication and ensure
 * consistent behavior across the module.
 */

// ============================================================================
// Deep Equality & Comparison
// ============================================================================

/**
 * Check if two values are deeply equal using structured comparison.
 * More performant than JSON.stringify for simple cases, handles edge cases better.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns True if values are deeply equal
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Same reference or primitive equality
  if (a === b) return true

  // Handle null/undefined
  if (a == null || b == null) return a === b

  // Handle different types
  if (typeof a !== typeof b) return false

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  // Handle objects (but not arrays which were handled above)
  if (typeof a === 'object' && typeof b === 'object') {
    // Don't compare array to object
    if (Array.isArray(a) !== Array.isArray(b)) return false

    const aKeys = Object.keys(a as object)
    const bKeys = Object.keys(b as object)

    if (aKeys.length !== bKeys.length) return false

    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false
      }
    }
    return true
  }

  // Primitive comparison (already handled by === above)
  return false
}

/**
 * Check if query args match filter args (partial match).
 * Used for optimistic update helpers to filter which queries to update.
 *
 * @param queryArgs - The full args of a query
 * @param filterArgs - Partial args to match against
 * @param skipKeys - Keys to skip during comparison (e.g., 'paginationOpts')
 * @returns True if all filterArgs match corresponding queryArgs
 */
export function argsMatch(
  queryArgs: Record<string, unknown>,
  filterArgs: Record<string, unknown>,
  skipKeys: string[] = [],
): boolean {
  for (const key of Object.keys(filterArgs)) {
    // Skip specified keys
    if (skipKeys.includes(key)) continue

    const filterValue = filterArgs[key]
    const queryValue = queryArgs[key]

    // Use deep equality for comparison
    if (!deepEqual(filterValue, queryValue)) {
      return false
    }
  }
  return true
}

/**
 * Compare two Convex JSON values for sorting.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 *
 * Handles all Convex value types including arrays (for multi-key sorts),
 * numbers, strings, booleans, BigInts, and null/undefined.
 *
 * @param a - First value (convexToJson format)
 * @param b - Second value (convexToJson format)
 * @returns Comparison result (-1, 0, or 1)
 */
export function compareJsonValues(a: unknown, b: unknown): number {
  // Handle arrays (multi-key sort)
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const comparison = compareJsonValues(a[i], b[i])
      if (comparison !== 0) return comparison
    }
    return 0
  }

  // Handle null/undefined
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1

  // Handle numbers
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  // Handle strings
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b)
  }

  // Handle booleans
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return (a ? 1 : 0) - (b ? 1 : 0)
  }

  // Handle BigInt ($integer format from convexToJson)
  if (
    typeof a === 'object' &&
    a !== null &&
    '$integer' in a &&
    typeof b === 'object' &&
    b !== null &&
    '$integer' in b
  ) {
    const aInt = a as { $integer: string }
    const bInt = b as { $integer: string }
    return Number(BigInt(aInt.$integer) - BigInt(bInt.$integer))
  }

  // Fallback to string comparison
  return String(a).localeCompare(String(b))
}

// ============================================================================
// Cookie Parsing
// ============================================================================

/**
 * Parse a cookie header string into a key-value object.
 * Handles URL-encoded values and edge cases properly.
 *
 * @param cookieHeader - The Cookie header string
 * @returns Object mapping cookie names to values
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {}

  const cookies: Record<string, string> = {}

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...valueParts] = cookie.split('=')
    const name = rawName?.trim()
    if (!name) continue

    // Join back in case value contains '='
    const value = valueParts.join('=').trim()

    try {
      // Decode URL-encoded values
      cookies[name] = decodeURIComponent(value)
    } catch {
      // If decoding fails, use raw value
      cookies[name] = value
    }
  }

  return cookies
}

/**
 * Get a specific cookie value from a cookie header string.
 *
 * @param cookieHeader - The Cookie header string
 * @param name - The cookie name to retrieve
 * @returns The cookie value or null if not found
 */
export function getCookie(cookieHeader: string | null | undefined, name: string): string | null {
  const cookies = parseCookies(cookieHeader)
  return cookies[name] ?? null
}

// ============================================================================
// Pagination ID Generation
// ============================================================================

/**
 * Generate a new unique pagination ID.
 * Uses random numbers to avoid SSR global state issues.
 * Each call returns a new ID, suitable for cache-busting.
 *
 * @returns A unique numeric ID
 */
export function generatePaginationId(): number {
  // Use random number to avoid SSR global state leak
  // Math.random() is sufficient since this is only used for cache-busting
  // Guarantees range [1, MAX_SAFE_INTEGER] - never returns 0
  return Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 1)) + 1
}
