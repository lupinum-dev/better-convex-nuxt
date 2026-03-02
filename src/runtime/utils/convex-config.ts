export type SiteUrlResolutionSource = 'explicit' | 'derived' | 'missing' | 'invalid-derived'

export interface ResolveConvexSiteUrlInput {
  url?: string | null
  siteUrl?: string | null
}

export interface ResolveConvexSiteUrlResult {
  siteUrl?: string
  source: SiteUrlResolutionSource
}

export function isValidAbsoluteUrl(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Derive the Convex HTTP Actions host from the Convex deployment URL.
 * Example: https://foo.convex.cloud -> https://foo.convex.site
 */
export function deriveConvexSiteUrl(url?: string | null): string | undefined {
  if (!url) return undefined

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }

  if (parsed.hostname.endsWith('.convex.cloud')) {
    parsed.hostname = parsed.hostname.replace(/\.convex\.cloud$/, '.convex.site')
    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString().replace(/\/$/, '')
  }

  const isLocalConvexDevHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  if (isLocalConvexDevHost && parsed.port === '3210') {
    parsed.port = '3211'
    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString().replace(/\/$/, '')
  }

  return undefined
}

export function resolveConvexSiteUrl(input: ResolveConvexSiteUrlInput): ResolveConvexSiteUrlResult {
  if (input.siteUrl) {
    return { siteUrl: input.siteUrl, source: 'explicit' }
  }

  if (!input.url) {
    return { siteUrl: undefined, source: 'missing' }
  }

  const derived = deriveConvexSiteUrl(input.url)
  if (derived) {
    return { siteUrl: derived, source: 'derived' }
  }

  return { siteUrl: undefined, source: 'invalid-derived' }
}

export function getSiteUrlResolutionHint(url?: string | null): string {
  if (!url) {
    return 'Set `convex.url` (or `CONVEX_URL`) first, or provide `convex.siteUrl` explicitly.'
  }

  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return 'For local Convex dev, use `convex.url` = `http://127.0.0.1:3210` (or `http://localhost:3210`), or set `convex.siteUrl` explicitly.'
  }

  if (!url.includes('.convex.cloud')) {
    return 'Could not derive `siteUrl` from `convex.url` because this is not a `.convex.cloud` URL. Set `convex.siteUrl` explicitly for your custom HTTP Actions domain.'
  }

  return 'Set `convex.siteUrl` explicitly to your Convex HTTP Actions host (for example `https://your-app.convex.site`).'
}

export function normalizeAuthRoute(authRoute?: string | null): string {
  const raw = authRoute || '/api/auth'
  return (raw.startsWith('/') ? raw : `/${raw}`).replace(/\/+$/, '') || '/api/auth'
}
