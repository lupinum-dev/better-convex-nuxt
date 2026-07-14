export function isSameOrigin(origin: string, requestOrigin: string): boolean {
  try {
    return new URL(origin).origin === requestOrigin && origin === new URL(origin).origin
  } catch {
    return false
  }
}

function hasCrossSiteFetchMetadata(value: string | null): boolean {
  return (value || '')
    .split(',')
    .some((entry) => ['cross-site', 'same-site'].includes(entry.trim().toLowerCase()))
}

function isSameOriginReferer(referer: string, requestOrigin: string): boolean {
  try {
    const url = new URL(referer)
    return !url.username && !url.password && url.origin === requestOrigin
  } catch {
    return false
  }
}

function isCoreOAuthPostCallbackPath(path: string): boolean {
  const match = /^\/callback\/([^/]+)$/.exec(path)
  if (!match?.[1]) return false
  try {
    const providerId = decodeURIComponent(match[1])
    return (
      providerId.length > 0 &&
      providerId !== '.' &&
      providerId !== '..' &&
      !providerId.includes('/') &&
      !providerId.includes('\\') &&
      ![...providerId].some((character) => {
        const code = character.charCodeAt(0)
        return code <= 31 || code === 127
      })
    )
  } catch {
    return false
  }
}

/** Reject explicit cross-origin browser evidence without excluding headerless server clients. */
export function isCrossOriginAuthRequest(
  headers: Headers,
  method: string,
  requestOrigin: string,
  authPath: string,
): boolean {
  // Core social providers such as Apple POST their OAuth result cross-site.
  // Better Auth owns the state/PKCE ceremony on this one exact endpoint shape.
  if (method === 'POST' && isCoreOAuthPostCallbackPath(authPath)) return false

  const origin = headers.get('origin')
  if (origin !== null && !isSameOrigin(origin, requestOrigin)) return true

  if (method !== 'POST') return false
  if (hasCrossSiteFetchMetadata(headers.get('sec-fetch-site'))) return true

  const referer = headers.get('referer')
  return origin === null && referer !== null && !isSameOriginReferer(referer, requestOrigin)
}
