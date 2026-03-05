import type { H3Event } from 'h3'

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
  requestUrl: URL
  originalHost?: string | null
}

export function buildAuthProxyForwardHeaders(
  event: H3Event,
  options: AuthProxyForwardHeadersOptions,
): Record<string, string> {
  const headers = stripHopByHopHeaders(event.headers)
  // Intentionally preserve cookies. Better Auth routes may depend on multiple cookies
  // beyond the session token, and this proxy handles generic auth endpoints.
  const originalHost = options.originalHost || options.requestUrl.host
  const originalProto = options.requestUrl.protocol.replace(':', '')

  headers.set('x-forwarded-host', originalHost)
  headers.set('x-forwarded-proto', originalProto)

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
