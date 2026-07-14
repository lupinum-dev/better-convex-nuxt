import { describe, expect, it } from 'vitest'

import type { ModuleOptions } from '../../src/module'
import { isConvexAuthEnabled, normalizeConvexAuthConfig } from '../../src/runtime/utils/auth-config'

describe('auth config normalization (vNext §5.1)', () => {
  it('installs auth with defaults when omitted', () => {
    const auth = normalizeConvexAuthConfig(undefined)
    expect(auth).not.toBe(false)
    if (auth === false) throw new Error('expected enabled')
    expect(auth.proxy.trustedClientIpHeader).toBe('')
    expect(auth.routeProtection).toEqual({ redirectTo: '/auth/signin', preserveReturnTo: true })
    expect(isConvexAuthEnabled(auth)).toBe(true)
  })

  it('omitted and {} normalize to the same enabled configuration', () => {
    expect(normalizeConvexAuthConfig(undefined)).toEqual(normalizeConvexAuthConfig({}))
  })

  it('disables auth entirely for false', () => {
    const auth = normalizeConvexAuthConfig(false)
    expect(auth).toBe(false)
    expect(isConvexAuthEnabled(auth)).toBe(false)
  })

  it('materializes proxy, debug, and routeProtection overrides', () => {
    const auth = normalizeConvexAuthConfig({
      proxy: { maxRequestBodyBytes: 10, trustedClientIpHeader: 'CF-Connecting-IP' },
      debug: { clientAuthFlow: true },
      routeProtection: { redirectTo: '/login', preserveReturnTo: false },
    })
    if (auth === false) throw new Error('expected enabled')
    expect(auth.proxy.maxRequestBodyBytes).toBe(10)
    expect(auth.proxy.trustedClientIpHeader).toBe('cf-connecting-ip')
    expect(auth.debug).toEqual({ authFlow: false, clientAuthFlow: true, serverAuthFlow: false })
    expect(auth.routeProtection).toEqual({ redirectTo: '/login', preserveReturnTo: false })
  })

  it('strips the build-only client path from the runtime shape', () => {
    const auth = normalizeConvexAuthConfig({ client: './auth-client.ts' })
    if (auth === false) throw new Error('expected enabled')
    expect('client' in auth).toBe(false)
  })

  it('rejects malformed trusted ingress header names', () => {
    expect(() =>
      normalizeConvexAuthConfig({ proxy: { trustedClientIpHeader: 'bad\nheader' } }),
    ).toThrow('valid HTTP header name')
  })
})

// ============================================================================
// Module-options type contracts (vNext §6 auth-configuration assertion list).
// These type-only assertions never run; a reverted deletion or a regressed
// `auth: false` exclusion makes the `@ts-expect-error` lines fail typecheck
// (`pnpm run test:types` / `pnpm vitest run --project=unit
// test/unit/auth-config.test.ts` under vitest's typecheck, and
// `pnpm run typecheck:module`).
// ============================================================================

function assertModuleOptions(_options: ModuleOptions): void {}

function _moduleOptionsTypeContracts() {
  // Positive: omitted auth and `auth: {}` both install auth with defaults.
  assertModuleOptions({})
  assertModuleOptions({ auth: {} })
  assertModuleOptions({ auth: { routeProtection: { redirectTo: '/login' } } })
  assertModuleOptions({ auth: { proxy: { trustedClientIpHeader: 'cf-connecting-ip' } } })
  // Positive: `auth: false` is a Convex-only build.
  assertModuleOptions({ auth: false })

  // @ts-expect-error auth.skipRoutes is deleted (vNext §5.1)
  assertModuleOptions({ auth: { skipRoutes: [] } })
  // @ts-expect-error auth.unauthorized is deleted (vNext §5.1)
  assertModuleOptions({ auth: { unauthorized: {} } })
  // @ts-expect-error there is no `enabled` toggle; the grammar is `false | options`
  assertModuleOptions({ auth: { enabled: false } })
  // @ts-expect-error route is fixed at /api/auth
  assertModuleOptions({ auth: { route: '/custom/auth' } })
  // @ts-expect-error the browser proxy is same-origin only
  assertModuleOptions({ auth: { trustedOrigins: ['https://a.example'] } })
  // @ts-expect-error the cross-request JWT cache was removed
  assertModuleOptions({ auth: { cache: {} } })

  // @ts-expect-error the old top-level authRoute is deleted; the route is fixed
  assertModuleOptions({ authRoute: '/api/auth' })
  // @ts-expect-error cross-origin proxy configuration is deleted
  assertModuleOptions({ trustedOrigins: ['https://a.example'] })
  // @ts-expect-error the old top-level skipAuthRoutes is deleted (vNext §5.1)
  assertModuleOptions({ skipAuthRoutes: ['/public'] })
  // @ts-expect-error the cross-request auth cache is deleted
  assertModuleOptions({ authCache: { enabled: true } })
  // @ts-expect-error the old top-level authProxy is deleted; use auth.proxy
  assertModuleOptions({ authProxy: { maxRequestBodyBytes: 10 } })
  // @ts-expect-error the old top-level auth-only debug is deleted; use auth.debug
  assertModuleOptions({ debug: { authFlow: true } })
}

// `auth: false` structurally excludes every auth-only field (vNext §5.1: "the
// type offers no nested auth-only fields in that branch"). Once narrowed to
// the `false` arm, none of `ConvexAuthOptions`' fields are reachable — this is
// the actual exclusion mechanism (a discriminated `false | options` value, not
// an options object with a redundant `enabled` toggle).
function _authFalseBranchExcludesNestedFields(auth: ModuleOptions['auth']) {
  if (auth === false) {
    // @ts-expect-error the `false` branch has no `proxy` (or any auth-only) field
    return auth.proxy
  }
  return auth?.proxy
}
void _authFalseBranchExcludesNestedFields

describe('auth config type contracts (vNext §6)', () => {
  it('is a type-only assertion module; see _moduleOptionsTypeContracts', () => {
    expect(true).toBe(true)
  })
})
