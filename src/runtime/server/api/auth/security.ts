/**
 * Same-origin is strict (protocol + host + port), not host-only.
 */
export function isOriginAllowed(
  origin: string,
  requestOrigin: string,
  trustedOrigins: string[],
): boolean {
  try {
    const originUrl = new URL(origin)
    if (originUrl.origin === requestOrigin) return true
  } catch {
    // Invalid origin URL
  }

  for (const trusted of trustedOrigins) {
    if (trusted.includes('*')) {
      const pattern = trusted
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
      if (new RegExp(`^${pattern}$`).test(origin)) return true
    } else if (origin === trusted) {
      return true
    }
  }

  return false
}

const authRoutePatternCache = new Map<string, RegExp>()

export function getAuthRoutePattern(authRoute: string): RegExp {
  const cached = authRoutePatternCache.get(authRoute)
  if (cached) return cached
  const pattern = new RegExp(`^${authRoute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  authRoutePatternCache.set(authRoute, pattern)
  return pattern
}
