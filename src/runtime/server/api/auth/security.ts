/**
 * Same-origin is strict (protocol + host + port), not host-only.
 */
function isOriginPatternUrl(url: URL): boolean {
  return !url.username
    && !url.password
    && !url.search
    && !url.hash
    && url.pathname === '/'
}

function escapeRegex(input: string): string {
  return input.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

function hostnameLabelMatches(patternLabel: string, actualLabel: string): boolean {
  if (patternLabel === '*') {
    return actualLabel.length > 0
  }

  if (!patternLabel.includes('*')) {
    return patternLabel === actualLabel
  }

  const pattern = `^${escapeRegex(patternLabel).replace(/\*/g, '[^.]*')}$`
  return new RegExp(pattern).test(actualLabel)
}

function hostnameMatchesPattern(patternHostname: string, actualHostname: string): boolean {
  const patternLabels = patternHostname.split('.')
  const actualLabels = actualHostname.split('.')

  if (patternLabels.length !== actualLabels.length) {
    return false
  }

  for (let i = 0; i < patternLabels.length; i++) {
    const patternLabel = patternLabels[i]
    const actualLabel = actualLabels[i]
    if (!patternLabel || !actualLabel) return false
    if (!hostnameLabelMatches(patternLabel, actualLabel)) {
      return false
    }
  }

  return true
}

function trustedOriginPatternMatches(origin: string, trustedPattern: string): boolean {
  let originUrl: URL
  let trustedUrl: URL
  try {
    originUrl = new URL(origin)
    trustedUrl = new URL(trustedPattern)
  } catch {
    return false
  }

  // Trusted entries are origin patterns only (scheme + host + optional port).
  if (!isOriginPatternUrl(trustedUrl)) {
    return false
  }

  if (trustedUrl.protocol !== originUrl.protocol) return false
  if (trustedUrl.port !== originUrl.port) return false

  return hostnameMatchesPattern(trustedUrl.hostname, originUrl.hostname)
}

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
    if (trustedOriginPatternMatches(origin, trusted)) return true
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
