/**
 * OWASP A10: Server-Side Request Forgery (SSRF)
 */
import { describe, expect, it } from 'vitest'

import { isOriginAllowed } from '../../../src/runtime/server/api/auth/security'
import { getCanonicalRedirectTarget } from '../../../src/runtime/server/api/auth/redirect-utils'

describe('OWASP A10: SSRF', () => {
  it('only follows canonical redirects when origin, path, and query all match', () => {
    expect(
      getCanonicalRedirectTarget(
        'https://app.convex.site/api/auth/token',
        'https://app.convex.site/api/auth/token',
        'https://app.convex.site',
      ),
    ).toBe('https://app.convex.site/api/auth/token')

    expect(
      getCanonicalRedirectTarget(
        'https://app.convex.site/api/auth/token',
        'https://app.convex.site/api/auth/token?x=1',
        'https://app.convex.site',
      ),
    ).toBeNull()
  })

  it('rejects redirects to localhost, metadata, and other origins', () => {
    expect(
      getCanonicalRedirectTarget(
        'https://app.convex.site/api/auth/token',
        'http://localhost/api/auth/token',
        'https://app.convex.site',
      ),
    ).toBeNull()

    expect(
      getCanonicalRedirectTarget(
        'https://app.convex.site/api/auth/token',
        'http://169.254.169.254/latest/meta-data/',
        'https://app.convex.site',
      ),
    ).toBeNull()

    expect(
      getCanonicalRedirectTarget(
        'https://app.convex.site/api/auth/token',
        'https://evil.example.com/api/auth/token',
        'https://app.convex.site',
      ),
    ).toBeNull()
  })

  it('keeps trusted origins scoped to CORS checks rather than upstream target selection', () => {
    expect(
      isOriginAllowed(
        'https://preview-123.vercel.app',
        'https://app.example.com',
        ['https://preview-*.vercel.app'],
      ),
    ).toBe(true)

    expect(
      isOriginAllowed(
        'https://preview-123.vercel.app.evil.com',
        'https://app.example.com',
        ['https://preview-*.vercel.app'],
      ),
    ).toBe(false)
  })
})
