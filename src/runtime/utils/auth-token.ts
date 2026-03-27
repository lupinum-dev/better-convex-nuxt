import type { ConvexClientAuthMode, ConvexServerAuthMode } from './types'

const SESSION_COOKIE_NAME = 'better-auth.session_token'
const SECURE_SESSION_COOKIE_NAME = '__Secure-better-auth.session_token'

export interface SharedAuthTokenState {
  value: string | null
}

export interface ResolveClientAuthTokenOptions {
  auth: ConvexClientAuthMode
  cookieHeader: string
  siteUrl: string | undefined
  cachedToken: SharedAuthTokenState
}

export interface ResolveServerAuthTokenOptions {
  auth: ConvexServerAuthMode
  authToken?: string
  cookieHeader: string
  siteUrl: string | undefined
  cachedToken?: SharedAuthTokenState
  getCachedToken?: (sessionToken: string) => Promise<string | null>
  setCachedToken?: (sessionToken: string, token: string) => Promise<void>
}

export function hasBetterAuthSessionCookie(cookieHeader: string): boolean {
  return (
    cookieHeader.includes(`${SESSION_COOKIE_NAME}=`) ||
    cookieHeader.includes(`${SECURE_SESSION_COOKIE_NAME}=`)
  )
}

export function getBetterAuthSessionToken(cookieHeader: string): string | null {
  const segments = cookieHeader.split(';')
  for (const segment of segments) {
    const trimmed = segment.trim()
    if (trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return trimmed.slice(SESSION_COOKIE_NAME.length + 1)
    }
    if (trimmed.startsWith(`${SECURE_SESSION_COOKIE_NAME}=`)) {
      return trimmed.slice(SECURE_SESSION_COOKIE_NAME.length + 1)
    }
  }

  return null
}

export async function exchangeConvexAuthToken(
  siteUrl: string,
  cookieHeader: string,
): Promise<string | undefined> {
  const url = `${siteUrl}/api/auth/convex/token` as string
  const fetchJson = $fetch as unknown as (
    request: string,
    options?: { headers?: Record<string, string> },
  ) => Promise<{ token?: string } | null>
  const response = await fetchJson(url, {
    headers: { Cookie: cookieHeader },
  })

  return response?.token
}

export async function resolveClientAuthToken(
  options: ResolveClientAuthTokenOptions,
): Promise<string | undefined> {
  const { auth, cookieHeader, siteUrl, cachedToken } = options

  if (auth === 'none') {
    return undefined
  }

  if (!hasBetterAuthSessionCookie(cookieHeader)) {
    return undefined
  }

  if (cachedToken.value) {
    return cachedToken.value
  }

  if (!siteUrl) {
    return undefined
  }

  try {
    const token = await exchangeConvexAuthToken(siteUrl, cookieHeader)
    if (token) {
      cachedToken.value = token
    }
    return token
  } catch {
    return undefined
  }
}

export async function resolveServerAuthToken(
  options: ResolveServerAuthTokenOptions,
): Promise<string | undefined> {
  const {
    auth,
    authToken,
    cookieHeader,
    siteUrl,
    cachedToken,
    getCachedToken,
    setCachedToken,
  } = options

  if (authToken) {
    return authToken
  }

  if (auth === 'none') {
    return undefined
  }

  if (!hasBetterAuthSessionCookie(cookieHeader)) {
    if (auth === 'required') {
      throw new Error(
        '[serverConvex] Authentication required but no Better Auth session cookie was found',
      )
    }
    return undefined
  }

  if (cachedToken?.value) {
    return cachedToken.value
  }

  if (!siteUrl) {
    if (auth === 'required') {
      throw new Error('[serverConvex] Authentication required but convex.siteUrl is not configured')
    }
    return undefined
  }

  const sessionToken = getBetterAuthSessionToken(cookieHeader)
  if (sessionToken && getCachedToken) {
    const cached = await getCachedToken(sessionToken)
    if (cached) {
      if (cachedToken) {
        cachedToken.value = cached
      }
      return cached
    }
  }

  try {
    const token = await exchangeConvexAuthToken(siteUrl, cookieHeader)
    if (token) {
      if (cachedToken) {
        cachedToken.value = token
      }
      if (sessionToken && setCachedToken) {
        await setCachedToken(sessionToken, token)
      }
      return token
    }
  } catch (error) {
    if (auth === 'required') {
      throw error instanceof Error ? error : new Error('[serverConvex] Failed to resolve auth token')
    }
    return undefined
  }

  if (auth === 'required') {
    throw new Error('[serverConvex] Authentication required but token exchange returned no token')
  }

  return undefined
}
