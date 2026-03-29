import { describe, expect, it } from 'vitest'

import { resolveRouteProtectionDecision } from '../../src/runtime/utils/auth-route-protection'
import { resolveRedirectTarget, validateRedirectPath } from '../../src/runtime/utils/redirect-safety'

describe('Route Protection', () => {
  it('preserves the full return URL when redirecting a protected route', () => {
    const decision = resolveRouteProtectionDecision({
      meta: true,
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: true,
      currentPath: '/settings',
      currentFullPath: '/settings?tab=billing',
    })

    expect(decision?.redirectTo).toBe('/auth/signin?redirect=%2Fsettings%3Ftab%3Dbilling')
  })

  it('uses a custom redirect target from route meta when provided', () => {
    const decision = resolveRouteProtectionDecision({
      meta: { redirectTo: '/login?next=/dashboard' },
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: false,
      currentPath: '/dashboard',
    })

    expect(decision?.redirectTo).toBe('/login?next=/dashboard')
  })

  it('does not append a return path when preserveReturnTo is disabled', () => {
    const decision = resolveRouteProtectionDecision({
      meta: true,
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: false,
      currentPath: '/reports',
      currentFullPath: '/reports?filter=quarter',
    })

    expect(decision?.redirectTo).toBe('/auth/signin')
  })

  it('treats only the exact login path as the loop stop condition', () => {
    expect(
      resolveRouteProtectionDecision({
        meta: true,
        defaultRedirectTo: '/auth/signin',
        preserveReturnTo: true,
        currentPath: '/auth/signin',
        currentFullPath: '/auth/signin?redirect=%2Fdashboard',
      }),
    ).toBeNull()
  })

  it('rejects unsafe redirect values and falls back to a safe login path', () => {
    expect(validateRedirectPath('https://evil.example.com')).toBeNull()
    expect(validateRedirectPath('//evil.example.com')).toBeNull()
    expect(resolveRedirectTarget('https://evil.example.com', '/auth/signin', '/auth/signin'))
      .toBe('/')
  })
})
