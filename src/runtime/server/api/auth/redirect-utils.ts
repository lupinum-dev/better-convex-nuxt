export function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized.length > 0 ? normalized : '/'
}

/**
 * Follow only canonical redirects (e.g. apex -> www) where path + query stay identical.
 * This avoids leaking auth XHR/fetch requests to the browser as cross-origin redirects,
 * while still preserving intentional redirects (like OAuth provider redirects).
 */
export function getCanonicalRedirectTarget(currentTarget: string, locationHeader: string | null): string | null {
  if (!locationHeader) {
    return null
  }

  try {
    const fromUrl = new URL(currentTarget)
    const toUrl = new URL(locationHeader, fromUrl)

    if (!['http:', 'https:'].includes(toUrl.protocol)) {
      return null
    }

    const samePath = normalizePathname(toUrl.pathname) === normalizePathname(fromUrl.pathname)
    const sameQuery = toUrl.search === fromUrl.search
    const isCrossOrigin = toUrl.origin !== fromUrl.origin

    if (samePath && sameQuery && isCrossOrigin) {
      return toUrl.toString()
    }
  } catch {
    return null
  }

  return null
}

type FetchLike = typeof fetch

interface FetchWithCanonicalRedirectsOptions {
  target: string
  method: string
  headers: Record<string, string>
  body?: string
  maxRedirects?: number
  fetchImpl?: FetchLike
}

export async function fetchWithCanonicalRedirects({
  target,
  method,
  headers,
  body,
  maxRedirects = 2,
  fetchImpl = fetch,
}: FetchWithCanonicalRedirectsOptions): Promise<Response> {
  let resolvedTarget = target
  let response = await fetchImpl(resolvedTarget, {
    method,
    headers,
    body,
    redirect: 'manual',
  })

  let canonicalRedirectsFollowed = 0
  while (response.status >= 300 && response.status < 400 && canonicalRedirectsFollowed < maxRedirects) {
    const canonicalTarget = getCanonicalRedirectTarget(resolvedTarget, response.headers.get('location'))
    if (!canonicalTarget) {
      break
    }

    resolvedTarget = canonicalTarget
    canonicalRedirectsFollowed += 1
    response = await fetchImpl(resolvedTarget, {
      method,
      headers,
      body,
      redirect: 'manual',
    })
  }

  return response
}
