import { describe, expect, it } from 'vitest'

import type { ModuleOptions } from '../../src/module'
import { isConvexAuthEnabled, normalizeConvexAuthConfig } from '../../src/runtime/utils/auth-config'

describe('auth config normalization ', () => {
  it('installs auth with defaults when omitted', () => {
    const auth = normalizeConvexAuthConfig(undefined)
    expect(auth).not.toBe(false)
    if (auth === false) throw new Error('expected enabled')
    expect(auth.publicOrigin).toBe('')
    expect(auth.proxy.trustedClientIpHeader).toBe('')
    expect(auth.routeProtection).toEqual({
      redirectTo: '/auth/signin',
      preserveReturnTo: true,
    })
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
      publicOrigin: 'https://app.example.test/',
      proxy: {
        maxRequestBodyBytes: 10,
        trustedClientIpHeader: 'CF-Connecting-IP',
      },
      debug: { clientAuthFlow: true },
      routeProtection: { redirectTo: '/login', preserveReturnTo: false },
    })
    if (auth === false) throw new Error('expected enabled')
    expect(auth.publicOrigin).toBe('https://app.example.test')
    expect(auth.proxy.maxRequestBodyBytes).toBe(10)
    expect(auth.proxy.trustedClientIpHeader).toBe('cf-connecting-ip')
    expect(auth.debug).toEqual({
      authFlow: false,
      clientAuthFlow: true,
      serverAuthFlow: false,
    })
    expect(auth.routeProtection).toEqual({
      redirectTo: '/login',
      preserveReturnTo: false,
    })
  })

  it('strips the build-only client path from the runtime shape', () => {
    const auth = normalizeConvexAuthConfig({ client: './auth-client.ts' })
    if (auth === false) throw new Error('expected enabled')
    expect('client' in auth).toBe(false)
  })

  it('rejects malformed trusted ingress header names', () => {
    expect(() =>
      normalizeConvexAuthConfig({
        proxy: { trustedClientIpHeader: 'bad\nheader' },
      }),
    ).toThrow('valid HTTP header name')
    expect(() =>
      normalizeConvexAuthConfig({
        proxy: { trustedClientIpHeader: 'X-BCN-Verified-Client-IP' },
      }),
    ).toThrow('reserved x-bcn-* namespace')
  })

  it('defaults the public origin from SITE_URL and requires an explicit value to match', () => {
    const auth = normalizeConvexAuthConfig(
      { proxy: { trustedClientIpHeader: 'cf-connecting-ip' } },
      'https://app.example.test/',
    )
    if (auth === false) throw new Error('expected enabled')
    expect(auth.publicOrigin).toBe('https://app.example.test')

    expect(() =>
      normalizeConvexAuthConfig(
        {
          publicOrigin: 'https://other.example.test',
          proxy: { trustedClientIpHeader: 'cf-connecting-ip' },
        },
        'https://app.example.test',
      ),
    ).toThrow('must match SITE_URL')
  })

  it('requires an ingress-owned client IP header outside exact loopback development', () => {
    for (const publicOrigin of ['https://app.example.test', 'https://192.0.2.1']) {
      expect(() => normalizeConvexAuthConfig({ publicOrigin })).toThrow(
        'trustedClientIpHeader is required',
      )
    }

    for (const publicOrigin of [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
    ]) {
      const auth = normalizeConvexAuthConfig({ publicOrigin })
      if (auth === false) throw new Error('expected enabled')
      expect(auth.proxy.trustedClientIpHeader).toBe('')
    }
  })

  it.each([
    'http://app.example.test',
    'https://APP.example.test',
    'https://app.example.test:443',
    'https://app.example.test/path',
  ])('rejects an unsafe configured public origin: %s', (publicOrigin) => {
    expect(() => normalizeConvexAuthConfig({ publicOrigin })).toThrow()
  })
})

// ============================================================================
// Module-options type contracts. These assertions protect the supported
// configuration grammar and the `auth: false` exclusion.
// (`pnpm run test:types`, `pnpm test`, and `pnpm run typecheck:module`).
// ============================================================================

function assertModuleOptions(_options: ModuleOptions): void {}

function _moduleOptionsTypeContracts() {
  // Positive: omitted auth and `auth: {}` both install auth with defaults.
  assertModuleOptions({})
  assertModuleOptions({ auth: {} })
  assertModuleOptions({ auth: { publicOrigin: 'https://app.example.test' } })
  assertModuleOptions({ auth: { routeProtection: { redirectTo: '/login' } } })
  assertModuleOptions({
    auth: { proxy: { trustedClientIpHeader: 'cf-connecting-ip' } },
  })
  // Positive: `auth: false` is a Convex-only build.
  assertModuleOptions({ auth: false })

  // @ts-expect-error there is no `enabled` toggle; the grammar is `false | options`
  assertModuleOptions({ auth: { enabled: false } })
  // @ts-expect-error route is fixed at /api/auth
  assertModuleOptions({ auth: { route: '/custom/auth' } })
  // @ts-expect-error the browser proxy is same-origin only
  assertModuleOptions({ auth: { trustedOrigins: ['https://a.example'] } })
}

// `auth: false` structurally excludes every auth-only field ("the
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

describe('auth config type contracts ', () => {
  it('is a type-only assertion module; see _moduleOptionsTypeContracts', () => {
    expect(true).toBe(true)
  })
})
