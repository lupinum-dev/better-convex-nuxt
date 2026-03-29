import type { ConvexClientAuthMode } from './types'
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

function isBetterAuthSessionCookieName(cookieName: string): boolean {
  return (
    cookieName === BETTER_AUTH_SESSION_COOKIE_NAME
    || cookieName === BETTER_AUTH_SECURE_SESSION_COOKIE_NAME
  )
}

function isCookieExplicitlyCleared(setCookieValue: string): boolean {
  const lower = setCookieValue.toLowerCase()
  return (
    /(?:^|;\s*)max-age=0(?:;|$)/.test(lower)
    || /(?:^|;\s*)expires=thu,\s*01 jan 1970 00:00:00 gmt(?:;|$)/.test(lower)
  )
}

export function clearsBetterAuthSessionCookie(setCookieHeaders: string[]): boolean {
  for (const header of setCookieHeaders) {
    const firstPart = header.split(';', 1)[0]?.trim()
    if (!firstPart) continue

    const separatorIndex = firstPart.indexOf('=')
    if (separatorIndex <= 0) continue

    const cookieName = firstPart.slice(0, separatorIndex).trim()
    const cookieValue = firstPart.slice(separatorIndex + 1)

    if (!isBetterAuthSessionCookieName(cookieName)) continue
    if (!cookieValue || isCookieExplicitlyCleared(header)) {
      return true
    }
  }

  return false
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
