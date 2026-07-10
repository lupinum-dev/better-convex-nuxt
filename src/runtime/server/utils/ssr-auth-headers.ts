import type { H3Event } from 'h3'

/**
 * Merge `Cookie` into an existing `Vary` header value without dropping any
 * caller-set field (vNext §9 "Vary/Cache-Control"). Existing tokens are
 * preserved, whitespace is normalized, and `Cookie` is added exactly once
 * (case-insensitively) so an auth-enabled SSR response always varies by cookie
 * while a pre-existing `Vary: Accept-Encoding` survives.
 */
export function mergeVaryCookie(existing: string | number | string[] | undefined | null): string {
  const values: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    for (const part of raw.split(',')) {
      const token = part.trim()
      if (!token) continue
      const key = token.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      values.push(token)
    }
  }

  if (Array.isArray(existing)) {
    for (const entry of existing) push(String(entry))
  } else if (existing !== undefined && existing !== null) {
    push(String(existing))
  }

  if (!seen.has('cookie')) values.push('Cookie')
  return values.join(', ')
}

/**
 * Apply the SSR auth cache policy to the current response (vNext §9):
 *
 * - Every auth-enabled SSR response appends `Vary: Cookie`, preserving existing
 *   `Vary` values so a shared cache keys per cookie.
 * - A request carrying a recognized Better Auth cookie whose response serializes
 *   a token additionally gets `Cache-Control: private, no-store`, so a per-user
 *   JWT is never served to another user by an intermediary cache.
 */
export function applyConvexAuthSsrHeaders(
  event: H3Event,
  options: { authEnabled: boolean; hasBetterAuthCookie: boolean; serializesToken: boolean },
): void {
  const res = event.node.res
  if (options.authEnabled) {
    res.setHeader('Vary', mergeVaryCookie(res.getHeader('Vary')))
  }
  if (options.hasBetterAuthCookie && options.serializesToken) {
    res.setHeader('Cache-Control', 'private, no-store')
  }
}
