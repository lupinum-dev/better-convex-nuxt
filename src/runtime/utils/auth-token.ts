import type { ConvexClientAuthMode, ConvexServerAuthMode } from './types'
import {
  BETTER_AUTH_SECURE_SESSION_COOKIE_NAME,
  BETTER_AUTH_SESSION_COOKIE_NAME,
} from './constants'

export interface SharedAuthTokenState {
  value: string | null
}

export interface ResolveClientAuthTokenOptions {
  auth: ConvexClientAuthMode
  cookieHeader: string
  siteUrl: string | undefined
  cachedToken: SharedAuthTokenState
}

export function hasBetterAuthSessionCookie(cookieHeader: string): boolean {
  return (
    cookieHeader.includes(`${BETTER_AUTH_SESSION_COOKIE_NAME}=`) ||
    cookieHeader.includes(`${BETTER_AUTH_SECURE_SESSION_COOKIE_NAME}=`)
  )
}

export function getBetterAuthSessionToken(cookieHeader: string): string | null {
  const segments = cookieHeader.split(';')
  for (const segment of segments) {
    const trimmed = segment.trim()
    if (trimmed.startsWith(`${BETTER_AUTH_SESSION_COOKIE_NAME}=`)) {
      return trimmed.slice(BETTER_AUTH_SESSION_COOKIE_NAME.length + 1)
    }
    if (trimmed.startsWith(`${BETTER_AUTH_SECURE_SESSION_COOKIE_NAME}=`)) {
      return trimmed.slice(BETTER_AUTH_SECURE_SESSION_COOKIE_NAME.length + 1)
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
