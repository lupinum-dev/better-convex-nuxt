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

/** Return one credential-safe Convex site origin or throw before network access. */
export function normalizeConvexSiteUrl(siteUrl: string): string {
  let url: URL
  try {
    url = new URL(siteUrl)
  } catch {
    throw new TypeError('siteUrl is not a valid URL')
  }
  if (url.username || url.password) throw new TypeError('siteUrl must not contain credentials')
  if (url.search) throw new TypeError('siteUrl must not contain a query string')
  if (url.hash) throw new TypeError('siteUrl must not contain a fragment')
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new TypeError('siteUrl must not contain a non-root path')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('siteUrl must use http or https')
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new TypeError('http siteUrl is permitted only for loopback hosts')
  }
  return url.origin
}
