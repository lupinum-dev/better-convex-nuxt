import { describe, expect, it } from 'vitest'

import {
  buildAuthProxyForwardHeaders,
  shouldSkipProxyResponseHeader,
} from '../../src/runtime/auth/server/api/auth/headers'

describe('auth proxy header helpers', () => {
  it('strips hop-by-hop headers and preserves useful headers', () => {
    const event = {
      headers: new Headers({
        host: 'app.example.com',
        cookie:
          'a=1; better-auth.session_token=abc; theme=dark; __Secure-better-auth.session_token=secure',
        origin: 'https://app.example.com',
        accept: 'application/json',
        connection: 'keep-alive',
        'transfer-encoding': 'chunked',
      }),
    } as never

    const headers = buildAuthProxyForwardHeaders(event, {
      canonicalOrigin: new URL('https://canonical.example.com'),
    })

    expect(headers.cookie).toBe(
      'better-auth.session_token=abc; __Secure-better-auth.session_token=secure',
    )
    expect(headers.accept).toBe('application/json')
    expect(headers.origin).toBe('https://app.example.com')
    expect(headers.connection).toBeUndefined()
    expect(headers['transfer-encoding']).toBeUndefined()
    expect(headers.host).toBeUndefined()
  })

  it('injects forwarded host and proto', () => {
    const event = {
      headers: new Headers(),
      node: { req: { socket: { remoteAddress: '127.0.0.1' } } },
    } as never
    const headers = buildAuthProxyForwardHeaders(event, {
      canonicalOrigin: new URL('https://canonical.example.com'),
    })

    expect(headers['x-forwarded-host']).toBe('canonical.example.com')
    expect(headers['x-forwarded-proto']).toBe('https')
    expect(headers['x-forwarded-for']).toBe('127.0.0.1')
  })

  it('overrides client-supplied forwarded IP headers with the trusted request address', () => {
    const event = {
      headers: new Headers({
        'x-forwarded-for': '203.0.113.10, 10.0.0.2',
      }),
      context: { clientAddress: '198.51.100.24' },
      node: { req: { socket: { remoteAddress: '127.0.0.1' } } },
    } as never
    const headers = buildAuthProxyForwardHeaders(event, {
      canonicalOrigin: new URL('https://canonical.example.com'),
    })

    expect(headers['x-forwarded-for']).toBe('198.51.100.24')
  })

  it('does not trust x-forwarded-for when Nitro has no trusted client address', () => {
    const event = {
      headers: new Headers({
        'x-forwarded-for': '203.0.113.10, 10.0.0.2',
      }),
    } as never
    const headers = buildAuthProxyForwardHeaders(event, {
      canonicalOrigin: new URL('https://canonical.example.com'),
    })

    expect(headers['x-forwarded-for']).toBeUndefined()
  })

  it('skips unsafe proxy response headers', () => {
    expect(shouldSkipProxyResponseHeader('set-cookie')).toBe(true)
    expect(shouldSkipProxyResponseHeader('Content-Length')).toBe(true)
    expect(shouldSkipProxyResponseHeader('connection')).toBe(true)
    expect(shouldSkipProxyResponseHeader('content-type')).toBe(false)
  })
})
