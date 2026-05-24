/**
 * Consolidated OWASP helper/security coverage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildAuthProxyForwardHeaders,
  shouldSkipProxyResponseHeader,
} from '../../src/runtime/auth/server/api/auth/headers'
import { getCanonicalRedirectTarget } from '../../src/runtime/auth/server/api/auth/redirect-utils'
import { isOriginAllowed } from '../../src/runtime/auth/server/api/auth/security'
import { DEFAULT_CONVEX_AUTH_CONFIG } from '../../src/runtime/auth/shared/auth-config'
import { resolveRouteProtectionDecision } from '../../src/runtime/auth/shared/auth-route-protection'
import {
  clearsBetterAuthSessionCookie,
  getBetterAuthSessionToken,
  hasBetterAuthSessionCookie,
} from '../../src/runtime/auth/shared/auth-token'
import {
  decodeJwtPayload,
  decodeUserFromJwt,
  getJwtTimeUntilExpiryMs,
} from '../../src/runtime/convex/shared/convex-shared'
import { normalizeConvexRuntimeConfig } from '../../src/runtime/convex/shared/runtime-config'
import {
  resolveRedirectTarget,
  validateRedirectPath,
} from '../../src/runtime/utils/redirect-safety'

function mintJwt(payload: Record<string, unknown>): string {
  const base64Url = (value: string) =>
    Buffer.from(value, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

  return [
    base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    base64Url(JSON.stringify(payload)),
    'test-signature',
  ].join('.')
}

const backingStore = new Map<string, unknown>()

vi.mock('nitropack/runtime', () => ({
  useStorage: () => ({
    async getItem<T>(key: string): Promise<T | null> {
      return (backingStore.get(key) as T) ?? null
    },
    async setItem(key: string, value: unknown, _opts?: { ttl: number }) {
      backingStore.set(key, value)
    },
    async removeItem(key: string) {
      backingStore.delete(key)
    },
  }),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ public: { convex: {} } }),
}))

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

describe('OWASP A02: Cryptographic Failures', () => {
  it('returns null for malformed JWT strings and broken JSON payloads', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull()
    expect(decodeJwtPayload('a.b')).toBeNull()

    const brokenJson = Buffer.from('this is not json', 'utf8').toString('base64url')
    expect(decodeJwtPayload(`header.${brokenJson}.sig`)).toBeNull()
  })

  it('keeps expiry math finite and rejects invalid exp values', () => {
    expect(getJwtTimeUntilExpiryMs(mintJwt({ sub: 'user-1', exp: Number.NaN }))).toBeNull()
    expect(
      getJwtTimeUntilExpiryMs(mintJwt({ sub: 'user-1', exp: Number.POSITIVE_INFINITY })),
    ).toBeNull()
  })

  it('decodes only safe session profile fields from auth JWTs', () => {
    const bySub = decodeUserFromJwt(mintJwt({ sub: 'user-1', name: 'Alice' }))
    const byUserId = decodeUserFromJwt(mintJwt({ userId: 'user-2', email: 'bob@test.com' }))
    const emailOnly = decodeUserFromJwt(mintJwt({ email: 'carol@test.com' }))

    expect(bySub).toEqual({ displayName: 'Alice' })
    expect(byUserId).toEqual({ email: 'bob@test.com' })
    expect(emailOnly).toEqual({ email: 'carol@test.com' })
    expect(bySub).not.toHaveProperty('id')
    expect(byUserId).not.toHaveProperty('id')
  })
})

describe('OWASP A03: Injection', () => {
  it('rejects non-relative redirect targets and backslash normalization tricks', () => {
    expect(validateRedirectPath('javascript:alert(1)')).toBeNull()
    expect(validateRedirectPath('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(validateRedirectPath('/\\evil.example.com')).toBeNull()
    expect(validateRedirectPath('/foo//evil.example.com')).toBeNull()
  })

  it('rejects Unicode control and confusable redirect payloads', () => {
    expect(validateRedirectPath('/safe/\u202Eevil.example.com')).toBeNull()
    expect(validateRedirectPath('/safe/\u200Bhidden')).toBeNull()
  })

  it('falls back to a safe path when the primary redirect target is unsafe', () => {
    expect(resolveRedirectTarget('https://evil.example.com', '/dashboard', '/auth/signin')).toBe(
      '/dashboard',
    )
    expect(resolveRedirectTarget('javascript:alert(1)', '/dashboard', '/auth/signin')).toBe(
      '/dashboard',
    )
  })

  it('keeps forwarded proxy headers free of hop-by-hop headers', () => {
    const event = {
      headers: new Headers({
        host: 'app.example.com',
        cookie: 'session=abc; better-auth.session_token=abc123',
        connection: 'keep-alive',
        'transfer-encoding': 'chunked',
      }),
    } as never

    const headers = buildAuthProxyForwardHeaders(event, {
      canonicalOrigin: new URL('https://canonical.example.com'),
    })

    expect(headers.cookie).toBe('better-auth.session_token=abc123')
    expect(headers.connection).toBeUndefined()
    expect(headers['transfer-encoding']).toBeUndefined()
    expect(headers.host).toBeUndefined()
  })
})

describe('OWASP A05: Security Misconfiguration', () => {
  it('keeps the explicit auth posture return-path preserving', () => {
    expect(DEFAULT_CONVEX_AUTH_CONFIG.enabled).toBe(true)
    expect(DEFAULT_CONVEX_AUTH_CONFIG.routeProtection.preserveReturnTo).toBe(true)
    expect(DEFAULT_CONVEX_AUTH_CONFIG.unauthorized.enabled).toBe(false)
    expect(DEFAULT_CONVEX_AUTH_CONFIG.unauthorized.includeQueries).toBe(false)
  })

  it('normalizes auth-related runtime config to secure defaults', () => {
    const config = normalizeConvexRuntimeConfig({})

    expect(config.observability.enabled).toBe(true)
    expect(
      config.observability.level === 'critical' || config.observability.level === 'verbose',
    ).toBe(true)
    expect(config.auth.cache.enabled).toBe(false)
    expect(config.auth.cache.ttl).toBe(60)
    expect(config.auth.proxy.maxRequestBodyBytes).toBe(1_048_576)
    expect(config.auth.proxy.maxResponseBodyBytes).toBe(1_048_576)
  })

  it('filters malformed origin and route entries out of runtime config', () => {
    const config = normalizeConvexRuntimeConfig({
      auth: {
        trustedOrigins: ['https://preview.example.com', 123, null],
        skipAuthTokenFetchRoutes: ['/health', 456, undefined],
      },
    })

    expect(config.auth.trustedOrigins).toEqual(['https://preview.example.com'])
    expect(config.auth.skipAuthTokenFetchRoutes).toEqual(['/health'])
  })

  it('strips response headers that could weaken proxy hardening', () => {
    expect(shouldSkipProxyResponseHeader('content-encoding')).toBe(true)
    expect(shouldSkipProxyResponseHeader('transfer-encoding')).toBe(true)
    expect(shouldSkipProxyResponseHeader('content-length')).toBe(true)
  })
})

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

describe('OWASP A08: Integrity Failures', () => {
  beforeEach(() => {
    backingStore.clear()
  })

  it('hashes cache keys instead of storing raw session tokens', async () => {
    const { setCachedAuthToken } = await import('../../src/runtime/auth/server/auth-cache')

    await setCachedAuthToken('session-secret-token', 'jwt-value', 60)

    expect(
      Array.from(backingStore.keys()).some((key) => key.includes('session-secret-token')),
    ).toBe(false)
  })

  it('clearing one cached session does not affect another', async () => {
    const { getCachedAuthToken, serverConvexClearAuthCache, setCachedAuthToken } =
      await import('../../src/runtime/auth/server/auth-cache')

    await setCachedAuthToken('session-a', 'jwt-a', 60)
    await setCachedAuthToken('session-b', 'jwt-b', 60)

    await serverConvexClearAuthCache('session-a')

    expect(await getCachedAuthToken('session-a')).toBeNull()
    expect(await getCachedAuthToken('session-b')).toBe('jwt-b')
  })

  it('reads back the cached JWT for the same session token', async () => {
    const { getCachedAuthToken, setCachedAuthToken } =
      await import('../../src/runtime/auth/server/auth-cache')

    await setCachedAuthToken('session-abc', 'jwt-for-abc', 60)
    expect(await getCachedAuthToken('session-abc')).toBe('jwt-for-abc')
  })
})

describe('OWASP A10: Server-Side Request Forgery (SSRF)', () => {
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
      isOriginAllowed('https://preview-123.vercel.app', 'https://app.example.com', [
        'https://preview-*.vercel.app',
      ]),
    ).toBe(true)

    expect(
      isOriginAllowed('https://preview-123.vercel.app.evil.com', 'https://app.example.com', [
        'https://preview-*.vercel.app',
      ]),
    ).toBe(false)
  })
})
