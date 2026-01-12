/**
 * Route matching utility for skip auth routes.
 * Supports glob patterns like '/docs/**' and '/blog/*'
 */

/**
 * Check if a path matches any of the skip patterns.
 *
 * Supported patterns:
 * - Exact match: '/about' matches only '/about'
 * - Single wildcard: '/blog/*' matches '/blog/post' but not '/blog/post/comments'
 * - Double wildcard: '/docs/**' matches '/docs', '/docs/guide', '/docs/guide/auth'
 *
 * @param path - The current route path
 * @param patterns - Array of patterns to match against
 * @returns true if the path matches any pattern
 */
export function matchesSkipRoute(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    // Double wildcard: matches path and all descendants
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3)
      return path === prefix || path.startsWith(prefix + '/')
    }

    // Single wildcard: matches only direct children
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2)
      const remainder = path.slice(prefix.length + 1)
      return path.startsWith(prefix + '/') && !remainder.includes('/')
    }

    // Exact match
    return path === pattern
  })
}
