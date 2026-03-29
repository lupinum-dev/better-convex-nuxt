/**
 * OWASP A01: Broken Access Control
 */
import { describe, expect, it } from 'vitest'

import { resolveRouteProtectionDecision } from '../../../src/runtime/utils/auth-route-protection'
import { validateRedirectPath } from '../../../src/runtime/utils/redirect-safety'

describe('OWASP A01: Broken Access Control', () => {
  it('keeps protected routes protected even when the current URL carries a query string', () => {
    const decision = resolveRouteProtectionDecision({
      meta: true,
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: true,
      currentPath: '/admin/users',
      currentFullPath: '/admin/users?debug=true#bypass',
    })

    expect(decision?.redirectTo).toBe(
      '/auth/signin?redirect=%2Fadmin%2Fusers%3Fdebug%3Dtrue%23bypass',
    )
  })

  it('does not case-fold route paths before deciding access control', () => {
    const lower = resolveRouteProtectionDecision({
      meta: true,
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: false,
      currentPath: '/admin',
    })
    const upper = resolveRouteProtectionDecision({
      meta: true,
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: false,
      currentPath: '/Admin',
    })

    expect(lower).not.toBeNull()
    expect(upper).not.toBeNull()
  })

  it('rejects absolute redirect targets before navigation', () => {
    expect(validateRedirectPath('https://phish.example.com')).toBeNull()
    expect(validateRedirectPath('//phish.example.com')).toBeNull()
  })
})
