import { describe, expect, it } from 'vitest'

import {
  buildAuthProxyForwardHeaders,
  isSupportedProxyResponseContentEncoding,
  shouldSkipProxyResponseHeader,
} from '../../src/runtime/server/api/auth/headers'

describe('auth proxy header helpers', () => {
  it('strips hop-by-hop headers and preserves useful headers', () => {
    const event = {
      headers: new Headers({
        host: 'app.example.com',
        cookie:
          'a=1; not-better-auth=secret; better-auth.session_token=session; __Secure-better-auth.callback=state',
        origin: 'https://app.example.com',
        referer: 'https://app.example.com/account',
        'sec-fetch-site': 'same-origin',
        accept: 'application/json',
        'accept-encoding': 'unknown',
        connection: 'keep-alive, x-hop',
        'content-encoding': 'gzip',
        expect: '100-continue',
        'proxy-connection': 'keep-alive',
        'transfer-encoding': 'chunked',
        'x-hop': 'must-not-forward',
      }),
    } as never

    const headers = buildAuthProxyForwardHeaders(event, {})

    expect(headers.cookie).toBe(
      'better-auth.session_token=session; __Secure-better-auth.callback=state',
    )
    expect(headers.cookie).not.toContain('a=1')
    expect(headers.cookie).not.toContain('not-better-auth')
    expect(headers.accept).toBe('application/json')
    expect(headers.origin).toBe('https://app.example.com')
    expect(headers.referer).toBe('https://app.example.com/account')
    expect(headers['sec-fetch-site']).toBe('same-origin')
    expect(headers.connection).toBeUndefined()
    expect(headers['accept-encoding']).toBeUndefined()
    expect(headers['content-encoding']).toBeUndefined()
    expect(headers.expect).toBeUndefined()
    expect(headers['proxy-connection']).toBeUndefined()
    expect(headers['transfer-encoding']).toBeUndefined()
    expect(headers['x-hop']).toBeUndefined()
    expect(headers.host).toBeUndefined()
  })

  it('drops unowned host, protocol, client-IP, platform, and Better Auth proxy controls', () => {
    const event = {
      headers: new Headers({
        forwarded: 'for=10.0.0.1;host=evil.test;proto=http',
        'x-better-auth-forwarded-host': 'evil.test',
        'x-better-auth-forwarded-proto': 'http',
        'x-forwarded-for': '10.0.0.1',
        'x-forwarded-host': 'evil.test',
        'x-forwarded-proto': 'http',
        'x-real-ip': '10.0.0.2',
        'x-original-host': 'evil.test',
        'x-original-proto': 'http',
        'x-vercel-forwarded-host': 'evil.test',
        'cf-connecting-ip': '10.0.0.3',
        'true-client-ip': '10.0.0.4',
        'cloudfront-forwarded-proto': 'http',
        'front-end-https': 'off',
        'x-arr-ssl': 'insecure',
      }),
    } as never
    const headers = buildAuthProxyForwardHeaders(event, {})

    expect(headers).toEqual({})
  })

  it('accepts one IP only from the configured trusted ingress header', () => {
    const event = { headers: new Headers({ 'cf-connecting-ip': '203.0.113.4' }) } as never
    const headers = buildAuthProxyForwardHeaders(event, {
      trustedClientIpHeader: 'cf-connecting-ip',
    })
    expect(headers['x-forwarded-for']).toBe('203.0.113.4')
    expect(headers['cf-connecting-ip']).toBeUndefined()
  })

  it.each(['203.0.113.4, 10.0.0.1', '203.0.113.4 forwarded', '999.0.0.1'])(
    'rejects an invalid trusted ingress IP value: %s',
    (value) => {
      const event = { headers: new Headers({ 'cf-connecting-ip': value }) } as never
      const headers = buildAuthProxyForwardHeaders(event, {
        trustedClientIpHeader: 'cf-connecting-ip',
      })
      expect(headers['x-forwarded-for']).toBeUndefined()
      expect(headers['cf-connecting-ip']).toBeUndefined()
    },
  )

  it('skips unsafe proxy response headers', () => {
    for (const header of [
      'set-cookie',
      'Content-Length',
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'trailer',
      'Cache-Control',
      'Expires',
      'Surrogate-Control',
      'CDN-Cache-Control',
      'Vercel-CDN-Cache-Control',
      'Cloudflare-CDN-Cache-Control',
      'Netlify-CDN-Cache-Control',
      'Edge-Control',
      'X-Accel-Expires',
    ]) {
      expect(shouldSkipProxyResponseHeader(header), header).toBe(true)
    }
    expect(shouldSkipProxyResponseHeader('x-hop', 'keep-alive, X-Hop')).toBe(true)
    expect(shouldSkipProxyResponseHeader('content-type')).toBe(false)
  })

  it('accepts only encodings that the pinned Node fetch transparently decodes', () => {
    for (const value of [null, 'gzip', 'deflate', 'br', 'x-gzip', 'identity', 'gzip, br']) {
      expect(isSupportedProxyResponseContentEncoding(value), String(value)).toBe(true)
    }
    for (const value of [
      '',
      'compress',
      'zstd',
      'gzip, unknown',
      'identity, gzip',
      'gzip, identity',
      ',',
    ]) {
      expect(isSupportedProxyResponseContentEncoding(value), value).toBe(false)
    }
  })
})
