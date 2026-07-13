import { describe, expect, it } from 'vitest'

import { getBetterAuthSessionToken } from '../../src/runtime/utils/shared-helpers'
import { normalizeConvexSiteUrl } from '../../src/runtime/utils/site-url'

describe('configuration and cookie security regressions', () => {
  it('accepts only a bare HTTPS site origin except loopback development', () => {
    expect(normalizeConvexSiteUrl('https://demo.convex.site')).toBe('https://demo.convex.site')
    expect(normalizeConvexSiteUrl('http://127.0.0.1:3211')).toBe('http://127.0.0.1:3211')
    expect(() => normalizeConvexSiteUrl('http://internal.example')).toThrow()
    expect(() => normalizeConvexSiteUrl('https://demo.convex.site/private')).toThrow()
    expect(() => normalizeConvexSiteUrl('https://user:pass@demo.convex.site')).toThrow()
  })

  it('treats an explicitly empty secure session cookie as authoritative', () => {
    expect(
      getBetterAuthSessionToken(
        '__Secure-better-auth.session_token=; better-auth.session_token=stale',
      ),
    ).toBe('')
  })
})
