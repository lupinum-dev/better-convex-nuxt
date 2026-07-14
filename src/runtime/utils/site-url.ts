function isIpv4Loopback(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!match) return false
  const octets = match.slice(1).map(Number)
  return octets.every((octet) => octet <= 255) && octets[0] === 127
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '[::1]' ||
    host === '::1' ||
    isIpv4Loopback(host)
  )
}

function normalizeConvexOrigin(value: string, label: 'url' | 'siteUrl'): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError(`${label} is not a valid URL`)
  }
  if (url.username || url.password) throw new TypeError(`${label} must not contain credentials`)
  if (url.search) throw new TypeError(`${label} must not contain a query string`)
  if (url.hash) throw new TypeError(`${label} must not contain a fragment`)
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new TypeError(`${label} must not contain a non-root path`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`${label} must use http or https`)
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new TypeError(`http ${label} is permitted only for loopback hosts`)
  }
  return url.origin
}

/** Return one credential-safe Convex deployment origin or throw before client construction. */
export function normalizeConvexDeploymentUrl(url: string): string {
  return normalizeConvexOrigin(url, 'url')
}

/** Return one credential-safe Convex site origin or throw before network access. */
export function normalizeConvexSiteUrl(siteUrl: string): string {
  return normalizeConvexOrigin(siteUrl, 'siteUrl')
}
