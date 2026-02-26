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
        cookie: 'a=1',
        origin: 'https://app.example.com',
        accept: 'application/json',
        connection: 'keep-alive',
        'transfer-encoding': 'chunked',
      }),
    } as never

    const headers = buildAuthProxyForwardHeaders(event, {
      requestUrl: new URL('https://app.example.com/api/auth/convex/token'),
      originalHost: 'app.example.com',
    })

    expect(headers.cookie).toBe('a=1')
    expect(headers.accept).toBe('application/json')
    expect(headers.origin).toBe('https://app.example.com')
    expect(headers.connection).toBeUndefined()
    expect(headers['transfer-encoding']).toBeUndefined()
    expect(headers.host).toBeUndefined()
  })

  it('injects forwarded host and proto', () => {
    const event = { headers: new Headers() } as never
    const headers = buildAuthProxyForwardHeaders(event, {
      requestUrl: new URL('https://preview.example.com/api/auth/get-session?x=1'),
      originalHost: 'app.example.com:3000',
    })

    expect(headers['x-forwarded-host']).toBe('app.example.com:3000')
    expect(headers['x-forwarded-proto']).toBe('https')
  })

  it('skips unsafe proxy response headers', () => {
    expect(shouldSkipProxyResponseHeader('set-cookie')).toBe(true)
    expect(shouldSkipProxyResponseHeader('Content-Length')).toBe(true)
    expect(shouldSkipProxyResponseHeader('connection')).toBe(true)
    expect(shouldSkipProxyResponseHeader('content-type')).toBe(false)
  })
})
