import { describe, expect, it } from 'vitest'

import { resolveRouteProtectionDecision } from '../../src/runtime/utils/auth-route-protection'

describe('route protection decision', () => {
  it('does nothing when page is not protected', () => {
    expect(resolveRouteProtectionDecision({
      meta: undefined,
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: true,
      currentPath: '/dashboard',
    })).toBeNull()
  })

  it('redirects to default route and preserves return path', () => {
    const decision = resolveRouteProtectionDecision({
      meta: true,
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: true,
      currentPath: '/dashboard',
      currentFullPath: '/dashboard?tab=team',
    })
    expect(decision).toEqual({
      redirectTo: '/auth/signin?redirect=%2Fdashboard%3Ftab%3Dteam',
    })
  })

  it('uses per-page redirect override and avoids loops', () => {
    expect(resolveRouteProtectionDecision({
      meta: { redirectTo: '/login' },
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: false,
      currentPath: '/dashboard',
    })).toEqual({ redirectTo: '/login' })

    expect(resolveRouteProtectionDecision({
      meta: { redirectTo: '/login' },
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: true,
      currentPath: '/login',
    })).toBeNull()
  })

  it('supports object redirects without mutating route objects', () => {
    const routeTarget = { path: '/login', query: { source: 'guard' } }

    expect(resolveRouteProtectionDecision({
      meta: { redirectTo: routeTarget },
      defaultRedirectTo: '/auth/signin',
      preserveReturnTo: true,
      currentPath: '/dashboard',
      currentFullPath: '/dashboard?tab=team',
    })).toEqual({ redirectTo: routeTarget })
  })
})
