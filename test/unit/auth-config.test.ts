import { describe, expect, it } from 'vitest'

import { normalizeConvexAuthConfig } from '../../src/runtime/utils/auth-config'

describe('auth config normalization', () => {
  it('normalizes defaults from undefined', () => {
    const auth = normalizeConvexAuthConfig(undefined)
    expect(auth.enabled).toBe(true)
    expect(auth.routeProtection.redirectTo).toBe('/auth/signin')
    expect(auth.unauthorized.enabled).toBe(false)
    expect(auth.unauthorized.includeQueries).toBe(false)
  })

  it('accepts nested overrides', () => {
    const auth = normalizeConvexAuthConfig({
      enabled: false,
      routeProtection: { redirectTo: '/login', preserveReturnTo: false },
      unauthorized: { enabled: true, redirectTo: '/login', includeQueries: true },
    })
    expect(auth).toEqual({
      enabled: false,
      routeProtection: { redirectTo: '/login', preserveReturnTo: false },
      unauthorized: { enabled: true, redirectTo: '/login', includeQueries: true },
    })
  })
})

