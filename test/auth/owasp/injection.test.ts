/**
 * OWASP A03: Injection
 */
import { describe, expect, it } from 'vitest'

import { validateRedirectPath, resolveRedirectTarget } from '../../../src/runtime/utils/redirect-safety'
import { buildAuthProxyForwardHeaders } from '../../../src/runtime/server/api/auth/headers'

describe('OWASP A03: Injection', () => {
  it('rejects non-relative redirect targets and backslash normalization tricks', () => {
    expect(validateRedirectPath('javascript:alert(1)')).toBeNull()
    expect(validateRedirectPath('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(validateRedirectPath('/\\evil.example.com')).toBeNull()
    expect(validateRedirectPath('/foo//evil.example.com')).toBeNull()
  })

  it('falls back to a safe path when the primary redirect target is unsafe', () => {
    expect(resolveRedirectTarget('https://evil.example.com', '/dashboard', '/auth/signin'))
      .toBe('/dashboard')
    expect(resolveRedirectTarget('javascript:alert(1)', '/dashboard', '/auth/signin'))
      .toBe('/dashboard')
  })

  it('keeps forwarded proxy headers free of hop-by-hop headers', () => {
    const event = {
      headers: new Headers({
        host: 'app.example.com',
        cookie: 'session=abc',
        connection: 'keep-alive',
        'transfer-encoding': 'chunked',
      }),
    } as never

    const headers = buildAuthProxyForwardHeaders(event, {
      requestUrl: new URL('https://app.example.com/api/auth/token'),
    })

    expect(headers.cookie).toBe('session=abc')
    expect(headers.connection).toBeUndefined()
    expect(headers['transfer-encoding']).toBeUndefined()
    expect(headers.host).toBeUndefined()
  })
})
