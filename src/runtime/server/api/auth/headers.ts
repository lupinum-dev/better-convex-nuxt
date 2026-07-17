import type { H3Event } from 'h3'

import {
  CLIENT_IP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
  normalizeClientIp,
  requireProxyIpSecret,
  signClientIp,
} from '../../../shared/client-ip'
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
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-allow-origin',
  'access-control-expose-headers',
  'access-control-max-age',
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
    lower.startsWith('x-bcn-') ||
    lower === 'forwarded' ||
    lower === 'client-ip' ||
    lower === 'true-client-ip' ||
    lower === 'x-real-ip' ||
    lower.endsWith('-client-ip') ||
    lower.endsWith('-connecting-ip') ||
    lower.startsWith('x-original-') ||
    lower.startsWith('x-vercel-forwarded-') ||
    lower === 'cloudfront-forwarded-proto' ||
    lower === 'cf-visitor' ||
    lower === 'front-end-https' ||
    lower === 'x-envoy-external-address' ||
    lower === 'x-url-scheme' ||
    lower === 'x-scheme' ||
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
  /** Test seam; production reads the private process environment directly. */
  proxyIpSecret?: string | null
}

export async function buildAuthProxyForwardHeaders(
  event: H3Event,
  options: AuthProxyForwardHeadersOptions,
): Promise<Record<string, string>> {
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

  if (trustedHeader) {
    const secret = requireProxyIpSecret(
      options.proxyIpSecret === undefined
        ? process.env.BCN_AUTH_PROXY_IP_SECRET
        : options.proxyIpSecret,
    )
    if (clientIp) {
      headers.set(CLIENT_IP_HEADER, clientIp)
      headers.set(CLIENT_IP_SIGNATURE_HEADER, await signClientIp(clientIp, secret))
    }
  }

  return Object.fromEntries(headers.entries())
}

export function shouldSkipProxyResponseHeader(
  name: string,
  connectionHeader: string | null = null,
): boolean {
  const lower = name.toLowerCase()
  return (
    RESPONSE_HEADERS_TO_DROP.has(lower) ||
    isProxyControlHeader(name) ||
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
