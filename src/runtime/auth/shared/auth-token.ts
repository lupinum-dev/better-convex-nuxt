import {
  BETTER_AUTH_SECURE_SESSION_COOKIE_NAME,
  BETTER_AUTH_SESSION_COOKIE_NAME,
} from '../../utils/constants.js'
import type { ConvexClientAuthMode } from '../../utils/types.js'
import { toErrorMessage } from '../../utils/value-helpers.js'

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

export function getBetterAuthSessionTokens(cookieHeader: string): string[] {
  const tokens: string[] = []
  const segments = cookieHeader.split(';')
  for (const segment of segments) {
    const trimmed = segment.trim()
    if (trimmed.startsWith(`${BETTER_AUTH_SESSION_COOKIE_NAME}=`)) {
      tokens.push(trimmed.slice(BETTER_AUTH_SESSION_COOKIE_NAME.length + 1))
    } else if (trimmed.startsWith(`${BETTER_AUTH_SECURE_SESSION_COOKIE_NAME}=`)) {
      tokens.push(trimmed.slice(BETTER_AUTH_SECURE_SESSION_COOKIE_NAME.length + 1))
    }
  }

  return tokens.filter((token) => token.length > 0)
}

function isBetterAuthCookieName(cookieName: string): boolean {
  return cookieName.startsWith('better-auth.') || cookieName.startsWith('__Secure-better-auth.')
}

export function filterBetterAuthCookieHeader(cookieHeader: string): string {
  const filtered: string[] = []

  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) continue
    const cookieName = trimmed.slice(0, separatorIndex).trim()
    if (!isBetterAuthCookieName(cookieName)) continue
    filtered.push(trimmed)
  }

  return filtered.join('; ')
}

function isBetterAuthSessionCookieName(cookieName: string): boolean {
  return (
    cookieName === BETTER_AUTH_SESSION_COOKIE_NAME ||
    cookieName === BETTER_AUTH_SECURE_SESSION_COOKIE_NAME
  )
}

function isCookieExplicitlyCleared(setCookieValue: string): boolean {
  const lower = setCookieValue.toLowerCase()
  return (
    /(?:^|;\s*)max-age=0(?:;|$)/.test(lower) ||
    /(?:^|;\s*)expires=thu,\s*01 jan 1970 00:00:00 gmt(?:;|$)/.test(lower)
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
  const betterAuthCookies = filterBetterAuthCookieHeader(cookieHeader)
  const response = await $fetch<{ token?: string } | null>(url, {
    headers: betterAuthCookies ? { Cookie: betterAuthCookies } : undefined,
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

  const token = await exchangeConvexAuthToken(siteUrl, cookieHeader).catch((error: unknown) => {
    throw new Error(`Failed to exchange Convex auth token. ${toErrorMessage(error)}`, {
      cause: error,
    })
  })
  if (token) {
    cachedToken.value = token
  }
  return token
}
