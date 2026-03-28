/**
 * Validate that a redirect path is safe (relative, no open-redirect vectors).
 * Returns the validated path or null if unsafe.
 */
export function validateRedirectPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  // Must start with a single slash (relative path only)
  if (!trimmed.startsWith('/')) return null

  // Reject protocol-relative URLs (//evil.com)
  if (trimmed.startsWith('//')) return null

  // Reject any path containing // (path traversal tricks like /foo//evil.com)
  if (trimmed.includes('//')) return null

  // Reject non-http protocols (javascript:, data:, etc.)
  try {
    const url = new URL(trimmed, 'http://localhost')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  } catch {
    return null
  }

  return trimmed
}

function stripQuery(path: string): string {
  const idx = path.indexOf('?')
  return idx >= 0 ? path.slice(0, idx) : path
}

/**
 * Resolve a safe redirect target from a raw query parameter.
 *
 * @param raw - The raw `?redirect=` value (may be null, encoded, or malicious)
 * @param fallbackPath - Where to redirect if raw is invalid
 * @param loginPath - The login page path, used to prevent redirect loops
 * @returns A safe relative path to navigate to
 */
export function resolveRedirectTarget(
  raw: string | null | undefined,
  fallbackPath: string,
  loginPath?: string,
): string {
  const target = validateRedirectPath(raw) ?? fallbackPath

  // Login-loop prevention: if target resolves to the login page, go to root
  if (loginPath && stripQuery(target) === stripQuery(loginPath)) {
    return '/'
  }

  return target
}
