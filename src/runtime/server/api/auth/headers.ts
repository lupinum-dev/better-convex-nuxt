import type { H3Event } from 'h3'

import { filterBetterAuthCookies } from '../../../utils/shared-helpers'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
])

function isProxyControlHeader(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower === 'forwarded' ||
    lower.startsWith('x-forwarded-') ||
    lower.startsWith('x-better-auth-forwarded-')
  )
}

function stripHopByHopHeaders(headers: Headers): Headers {
  const result = new Headers()
  for (const [key, value] of headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase()) || isProxyControlHeader(key)) {
      continue
    }
    result.set(key, value)
  }
  return result
}

export interface AuthProxyForwardHeadersOptions {
  requestUrl: URL
  trustedClientIpHeader?: string | null
}

function normalizeClientIp(value: string | null): string | null {
  if (
    !value ||
    value.includes(',') ||
    [...value].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 32 || code === 127
    })
  ) {
    return null
  }
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split('.').every((part) => Number(part) <= 255) ? value : null
  }
  try {
    new URL(`http://[${value}]/`)
    return value.toLowerCase()
  } catch {
    return null
  }
}

export function buildAuthProxyForwardHeaders(
  event: H3Event,
  options: AuthProxyForwardHeadersOptions,
): Record<string, string> {
  const trustedHeader = options.trustedClientIpHeader
  const clientIp = trustedHeader ? normalizeClientIp(event.headers.get(trustedHeader)) : null
  const headers = stripHopByHopHeaders(event.headers)
  if (trustedHeader) headers.delete(trustedHeader)
  const authCookieHeader = filterBetterAuthCookies(headers.get('cookie'))
  if (authCookieHeader) {
    headers.set('cookie', authCookieHeader)
  } else {
    headers.delete('cookie')
  }

  headers.set('x-better-auth-forwarded-host', options.requestUrl.host)
  headers.set('x-better-auth-forwarded-proto', options.requestUrl.protocol.replace(':', ''))
  if (clientIp) headers.set('x-forwarded-for', clientIp)

  return Object.fromEntries(headers.entries())
}

export function shouldSkipProxyResponseHeader(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower === 'set-cookie' ||
    lower === 'content-encoding' ||
    lower === 'content-length' ||
    lower === 'transfer-encoding' ||
    lower === 'connection'
  )
}
