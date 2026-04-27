import type { H3Event } from 'h3'

import { filterBetterAuthCookieHeader } from '../../../shared/auth-token.js'

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
])

function stripHopByHopHeaders(headers: Headers): Headers {
  const result = new Headers()
  for (const [key, value] of headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue
    }
    result.set(key, value)
  }
  return result
}

export interface AuthProxyForwardHeadersOptions {
  canonicalOrigin: URL
}

function resolveForwardedClientIp(event: H3Event): string | null {
  const trustedClientAddress = event.context?.clientAddress
  if (trustedClientAddress) {
    return trustedClientAddress
  }

  const remoteAddress = event.node?.req?.socket?.remoteAddress
  if (remoteAddress) {
    return remoteAddress
  }

  return null
}

export function buildAuthProxyForwardHeaders(
  event: H3Event,
  options: AuthProxyForwardHeadersOptions,
): Record<string, string> {
  const headers = stripHopByHopHeaders(event.headers)
  const betterAuthCookies = filterBetterAuthCookieHeader(event.headers.get('cookie') ?? '')
  const clientIp = resolveForwardedClientIp(event)

  if (betterAuthCookies) {
    headers.set('cookie', betterAuthCookies)
  } else {
    headers.delete('cookie')
  }

  headers.set('x-forwarded-host', options.canonicalOrigin.host)
  headers.set('x-forwarded-proto', options.canonicalOrigin.protocol.replace(':', ''))
  headers.delete('x-forwarded-for')
  if (clientIp) {
    headers.set('x-forwarded-for', clientIp)
  }

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
