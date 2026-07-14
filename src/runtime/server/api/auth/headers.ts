import type { H3Event } from 'h3'

import { filterBetterAuthCookies } from '../../../utils/shared-helpers'

const REQUEST_HEADERS_TO_DROP = new Set([
  'accept-encoding',
  'connection',
  'content-encoding',
  'content-length',
  'expect',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const RESPONSE_HEADERS_TO_DROP = new Set([
  'cache-control',
  'connection',
  'content-encoding',
  'content-length',
  'edge-control',
  'expires',
  'keep-alive',
  'pragma',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'set-cookie',
  'surrogate-control',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-accel-expires',
])

const SUPPORTED_RESPONSE_CONTENT_ENCODINGS = new Set([
  'br',
  'deflate',
  'gzip',
  'identity',
  'x-gzip',
])

function parseConnectionHeader(value: string | null): Set<string> {
  return new Set(
    (value || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )
}

function isProxyControlHeader(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower === 'forwarded' ||
    lower === 'client-ip' ||
    lower === 'true-client-ip' ||
    lower === 'x-real-ip' ||
    lower.endsWith('-client-ip') ||
    lower.endsWith('-connecting-ip') ||
    lower.startsWith('x-original-') ||
    lower.startsWith('x-vercel-forwarded-') ||
    lower === 'cloudfront-forwarded-proto' ||
    lower === 'front-end-https' ||
    lower === 'x-arr-ssl' ||
    lower.startsWith('x-forwarded-') ||
    lower.startsWith('x-better-auth-forwarded-')
  )
}

function stripUnsafeRequestHeaders(headers: Headers): Headers {
  const result = new Headers()
  const connectionHeaders = parseConnectionHeader(headers.get('connection'))
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase()
    if (
      REQUEST_HEADERS_TO_DROP.has(lower) ||
      connectionHeaders.has(lower) ||
      isProxyControlHeader(key)
    ) {
      continue
    }
    result.set(key, value)
  }
  return result
}

export interface AuthProxyForwardHeadersOptions {
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
  const headers = stripUnsafeRequestHeaders(event.headers)
  if (trustedHeader) headers.delete(trustedHeader)
  const authCookieHeader = filterBetterAuthCookies(headers.get('cookie'))
  if (authCookieHeader) {
    headers.set('cookie', authCookieHeader)
  } else {
    headers.delete('cookie')
  }

  if (clientIp) headers.set('x-forwarded-for', clientIp)

  return Object.fromEntries(headers.entries())
}

export function shouldSkipProxyResponseHeader(
  name: string,
  connectionHeader: string | null = null,
): boolean {
  const lower = name.toLowerCase()
  return (
    RESPONSE_HEADERS_TO_DROP.has(lower) ||
    lower === 'cdn-cache-control' ||
    lower.endsWith('-cdn-cache-control') ||
    parseConnectionHeader(connectionHeader).has(lower)
  )
}

export function isSupportedProxyResponseContentEncoding(value: string | null): boolean {
  if (value === null) return true
  const encodings = value.split(',').map((encoding) => encoding.trim().toLowerCase())
  if (encodings.includes('identity')) return encodings.length === 1
  return (
    encodings.length > 0 &&
    encodings.every((encoding) => SUPPORTED_RESPONSE_CONTENT_ENCODINGS.has(encoding))
  )
}
