import { describe, expect, it } from 'vitest'

import type { ModuleOptions } from '../../src/module'
import { isConvexAuthEnabled, normalizeConvexAuthConfig } from '../../src/runtime/utils/auth-config'

describe('auth config normalization (vNext §5.1)', () => {
  it('installs auth with defaults when omitted', () => {
    const auth = normalizeConvexAuthConfig(undefined)
    expect(auth).not.toBe(false)
    if (auth === false) throw new Error('expected enabled')
    expect(auth.route).toBe('/api/auth')
    expect(auth.trustedOrigins).toEqual([])
    expect(auth.cache).toBe(false)
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

  it('omitted/false cache is disabled; {} enables it with defaults', () => {
    const off = normalizeConvexAuthConfig({ cache: false })
    if (off === false) throw new Error('expected enabled')
    expect(off.cache).toBe(false)

    const on = normalizeConvexAuthConfig({ cache: {} })
    if (on === false) throw new Error('expected enabled')
    expect(on.cache).toEqual({ ttl: 60 })
  })

  it('materializes proxy, debug, and routeProtection overrides', () => {
    const auth = normalizeConvexAuthConfig({
      route: 'custom/auth',
      trustedOrigins: ['https://a.example'],
      proxy: { maxRequestBodyBytes: 10 },
      debug: { clientAuthFlow: true },
      routeProtection: { redirectTo: '/login', preserveReturnTo: false },
    })
    if (auth === false) throw new Error('expected enabled')
    expect(auth.route).toBe('/custom/auth')
    expect(auth.trustedOrigins).toEqual(['https://a.example'])
    expect(auth.proxy.maxRequestBodyBytes).toBe(10)
    expect(auth.debug).toEqual({ authFlow: false, clientAuthFlow: true, serverAuthFlow: false })
    expect(auth.routeProtection).toEqual({ redirectTo: '/login', preserveReturnTo: false })
  })

  it('strips the build-only client path from the runtime shape', () => {
    const auth = normalizeConvexAuthConfig({ client: './auth-client.ts' })
    if (auth === false) throw new Error('expected enabled')
    expect('client' in auth).toBe(false)
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
  // Positive: `auth: false` is a Convex-only build.
  assertModuleOptions({ auth: false })

  // @ts-expect-error auth.skipRoutes is deleted (vNext §5.1)
  assertModuleOptions({ auth: { skipRoutes: [] } })
  // @ts-expect-error auth.unauthorized is deleted (vNext §5.1)
  assertModuleOptions({ auth: { unauthorized: {} } })
  // @ts-expect-error there is no `enabled` toggle; the grammar is `false | options`
  assertModuleOptions({ auth: { enabled: false } })

  // @ts-expect-error the old top-level authRoute is deleted; use auth.route
  assertModuleOptions({ authRoute: '/api/auth' })
  // @ts-expect-error the old top-level trustedOrigins is deleted; use auth.trustedOrigins
  assertModuleOptions({ trustedOrigins: ['https://a.example'] })
  // @ts-expect-error the old top-level skipAuthRoutes is deleted (vNext §5.1)
  assertModuleOptions({ skipAuthRoutes: ['/public'] })
  // @ts-expect-error the old top-level authCache is deleted; use auth.cache
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
    // @ts-expect-error the `false` branch has no `route` (or any auth-only) field
    return auth.route
  }
  return auth?.route
}
void _authFalseBranchExcludesNestedFields

describe('auth config type contracts (vNext §6)', () => {
  it('is a type-only assertion module; see _moduleOptionsTypeContracts', () => {
    expect(true).toBe(true)
  })
})
