function hasForbiddenRedirectCodepoint(value: string): boolean {
  for (const char of value) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined) continue

    if (codePoint <= 31 || codePoint === 127) return true
    if (codePoint >= 8203 && codePoint <= 8207) return true
    if (codePoint >= 8234 && codePoint <= 8238) return true
    if (codePoint >= 8288 && codePoint <= 8297) return true
    if (codePoint === 65279) return true
  }

  return false
}

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

  // Reject backslashes — browsers normalize \ to /, so /\evil.com becomes //evil.com
  if (trimmed.includes('\\')) return null

  // Reject invisible/control characters that can reshape path rendering after
  // browser or Unicode normalization.
  if (hasForbiddenRedirectCodepoint(trimmed)) return null

  const decodedOnce = safeDecodeOnce(trimmed)
  if (decodedOnce === null) return null

  // Reject encoded slash/backslash variants after one decode pass, including
  // double-encoded inputs that still contain %2f/%5c after decode.
  if (
    decodedOnce.startsWith('//') ||
    decodedOnce.includes('//') ||
    decodedOnce.includes('\\') ||
    hasEncodedSlashOrBackslash(decodedOnce) ||
    hasForbiddenRedirectCodepoint(decodedOnce)
  ) {
    return null
  }

  // Reject non-http protocols (javascript:, data:, etc.)
  try {
    const url = new URL(trimmed, 'http://localhost')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  } catch {
    // Unparseable URL — reject as unsafe redirect
    return null
  }

  return trimmed
}

function safeDecodeOnce(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function hasEncodedSlashOrBackslash(value: string): boolean {
  const lower = value.toLowerCase()
  return lower.includes('%2f') || lower.includes('%5c')
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
  const target = validateRedirectPath(raw) ?? validateRedirectPath(fallbackPath) ?? '/'

  // Login-loop prevention: if target resolves to the login page, go to root
  if (loginPath && stripQuery(target) === stripQuery(loginPath)) {
    return '/'
  }

  return target
}
