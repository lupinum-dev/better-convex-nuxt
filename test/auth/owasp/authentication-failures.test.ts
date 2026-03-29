/**
 * OWASP A07: Authentication Failures
 */
import { describe, expect, it } from 'vitest'

import {
  clearsBetterAuthSessionCookie,
  getBetterAuthSessionToken,
  hasBetterAuthSessionCookie,
} from '../../../src/runtime/utils/auth-token'

describe('OWASP A07: Authentication Failures', () => {
  it('distinguishes detection from extraction for Better Auth session cookies', () => {
    const partial = 'my-better-auth.session_token=injected'
    const secure = '__Secure-better-auth.session_token=secure-abc=def; theme=dark'

    expect(hasBetterAuthSessionCookie(partial)).toBe(true)
    expect(getBetterAuthSessionToken(partial)).toBeNull()
    expect(getBetterAuthSessionToken(secure)).toBe('secure-abc=def')
  })

  it('only treats Better Auth cookies as session termination signals', () => {
    expect(
      clearsBetterAuthSessionCookie([
        'tracking=; Max-Age=0',
        'better-auth.session_token=active-token; Path=/; HttpOnly',
      ]),
    ).toBe(false)

    expect(
      clearsBetterAuthSessionCookie([
        'better-auth.session_token=deleted; Max-Age=0; Path=/; HttpOnly',
      ]),
    ).toBe(true)
  })

  it('recognizes both standard and secure session cookies as active session markers', () => {
    expect(hasBetterAuthSessionCookie('better-auth.session_token=abc123')).toBe(true)
    expect(hasBetterAuthSessionCookie('__Secure-better-auth.session_token=abc123')).toBe(true)
    expect(hasBetterAuthSessionCookie('theme=dark; lang=en')).toBe(false)
  })
})
