// Phase 0 PROTOTYPE of exchangeConvexToken transport rules (vNext.md §9).
// Establishes the Phase 4 implementation contract for redirect/loopback/
// control-character handling. Never-throwing; returns {token,status,error}.

export class ConvexCallError extends Error {
  constructor({ kind, message, status, cause }) {
    super(message)
    this.name = 'ConvexCallError'
    this.kind = kind
    if (status !== undefined) this.status = status
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        enumerable: false,
        configurable: true,
        writable: true,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Control-character rejection (synchronous, BEFORE any network access).
// Rejects ASCII control chars 0-0x1F and 0x7F, which includes CR and LF.
// ---------------------------------------------------------------------------
export function credentialHasControlChars(value) {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (c <= 31 || c === 127) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// normalizeSiteUrl (vNext.md §9):
//  - reject embedded credentials, query strings, fragments, non-root paths
//  - http: allowed ONLY for localhost | *.localhost | 127.0.0.0/8 | [::1]
//  - every other origin requires https:
// Returns the normalized origin (no trailing path).
// ---------------------------------------------------------------------------
function isIpv4Loopback(hostname) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  const parts = m.slice(1).map(Number)
  if (parts.some((p) => p > 255)) return false
  return parts[0] === 127 // 127.0.0.0/8
}

function isLoopbackHost(hostname) {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '[::1]' || h === '::1') return true
  if (isIpv4Loopback(h)) return true
  return false
}

export function normalizeSiteUrl(siteUrl) {
  let url
  try {
    url = new URL(siteUrl)
  } catch {
    throw new ConvexCallError({ kind: 'validation', message: 'Invalid site URL' })
  }
  if (url.username || url.password) {
    throw new ConvexCallError({
      kind: 'validation',
      message: 'Site URL must not contain credentials',
    })
  }
  if (url.search) {
    throw new ConvexCallError({
      kind: 'validation',
      message: 'Site URL must not contain a query string',
    })
  }
  if (url.hash) {
    throw new ConvexCallError({
      kind: 'validation',
      message: 'Site URL must not contain a fragment',
    })
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new ConvexCallError({
      kind: 'validation',
      message: 'Site URL must not contain a non-root path',
    })
  }
  const isHttps = url.protocol === 'https:'
  const isHttp = url.protocol === 'http:'
  if (!isHttps && !isHttp) {
    throw new ConvexCallError({ kind: 'validation', message: 'Site URL must be http or https' })
  }
  if (isHttp && !isLoopbackHost(url.hostname)) {
    throw new ConvexCallError({
      kind: 'validation',
      message: 'http is permitted only for loopback hosts',
    })
  }
  return url.origin
}

// ---------------------------------------------------------------------------
// exchangeConvexToken — never-throwing; redirect:'error' guarantees the
// credential is never sent to a redirect target.
// ---------------------------------------------------------------------------
export async function exchangeConvexToken({ siteUrl, credential, timeoutMs = 5000 }) {
  // 1. Synchronous validation BEFORE any request.
  if (!credential || typeof credential.value !== 'string' || credential.value.length === 0) {
    return {
      token: null,
      status: undefined,
      error: new ConvexCallError({ kind: 'validation', message: 'Empty credential' }),
    }
  }
  if (credentialHasControlChars(credential.value)) {
    return {
      token: null,
      status: undefined,
      error: new ConvexCallError({
        kind: 'validation',
        message: 'Credential contains control characters',
      }),
    }
  }
  let origin
  try {
    origin = normalizeSiteUrl(siteUrl)
  } catch (e) {
    return { token: null, status: undefined, error: e }
  }

  const headers =
    credential.type === 'cookie'
      ? { Cookie: credential.value }
      : { Authorization: `Bearer ${credential.value}` }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${origin}/api/auth/convex/token`, {
      method: 'GET',
      headers,
      redirect: 'error', // never follow a redirect; credential stays on the first hop only
      signal: controller.signal,
    })
    if (!response.ok) {
      return {
        token: null,
        status: response.status,
        error: new ConvexCallError({
          kind: response.status === 401 || response.status === 403 ? 'authentication' : 'transport',
          message: `Convex token exchange failed with HTTP ${response.status}`,
          status: response.status,
        }),
      }
    }
    const body = await response.json().catch(() => null)
    const token = body && typeof body.token === 'string' ? body.token : null
    if (!token) {
      return {
        token: null,
        status: response.status,
        error: new ConvexCallError({
          kind: 'transport',
          message: 'Exchange response did not include a token',
          status: response.status,
        }),
      }
    }
    return { token, status: response.status, error: null }
  } catch (error) {
    // A redirect:'error' rejection surfaces here as generic transport — by design
    // we do NOT distinguish it by message. The security property is that the
    // credential never reached the redirect target, not the label.
    return {
      token: null,
      status: undefined,
      error: new ConvexCallError({
        kind: 'transport',
        message: 'Convex token exchange could not complete',
        cause: error,
      }),
    }
  } finally {
    clearTimeout(timer)
  }
}
