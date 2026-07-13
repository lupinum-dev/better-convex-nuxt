import { describe, expect, it } from 'vitest'

import {
  buildAuthProxyForwardHeaders,
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
        accept: 'application/json',
        connection: 'keep-alive',
        'transfer-encoding': 'chunked',
      }),
    } as never

    const headers = buildAuthProxyForwardHeaders(event, {
      requestUrl: new URL('https://app.example.com/api/auth/convex/token'),
    })

    expect(headers.cookie).toBe(
      'better-auth.session_token=session; __Secure-better-auth.callback=state',
    )
    expect(headers.cookie).not.toContain('a=1')
    expect(headers.cookie).not.toContain('not-better-auth')
    expect(headers.accept).toBe('application/json')
    expect(headers.origin).toBe('https://app.example.com')
    expect(headers.connection).toBeUndefined()
    expect(headers['transfer-encoding']).toBeUndefined()
    expect(headers.host).toBeUndefined()
  })

  it('replaces proxy controls with authoritative Better Auth markers', () => {
    const event = {
      headers: new Headers({
        'x-better-auth-forwarded-host': 'evil.test',
        'x-forwarded-for': '10.0.0.1',
      }),
    } as never
    const headers = buildAuthProxyForwardHeaders(event, {
      requestUrl: new URL('https://preview.example.com/api/auth/get-session?x=1'),
    })

    expect(headers['x-better-auth-forwarded-host']).toBe('preview.example.com')
    expect(headers['x-better-auth-forwarded-proto']).toBe('https')
    expect(headers['x-forwarded-for']).toBeUndefined()
  })

  it('accepts one IP only from the configured trusted ingress header', () => {
    const event = { headers: new Headers({ 'cf-connecting-ip': '203.0.113.4' }) } as never
    const headers = buildAuthProxyForwardHeaders(event, {
      requestUrl: new URL('https://app.example.com/api/auth/get-session'),
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
        requestUrl: new URL('https://app.example.com/api/auth/get-session'),
        trustedClientIpHeader: 'cf-connecting-ip',
      })
      expect(headers['x-forwarded-for']).toBeUndefined()
      expect(headers['cf-connecting-ip']).toBeUndefined()
    },
  )

  it('skips unsafe proxy response headers', () => {
    expect(shouldSkipProxyResponseHeader('set-cookie')).toBe(true)
    expect(shouldSkipProxyResponseHeader('Content-Length')).toBe(true)
    expect(shouldSkipProxyResponseHeader('connection')).toBe(true)
    expect(shouldSkipProxyResponseHeader('content-type')).toBe(false)
  })
})
