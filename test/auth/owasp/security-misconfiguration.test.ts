/**
 * OWASP A05: Security Misconfiguration
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ public: { convex: {} } }),
}))

import {
  DEFAULT_CONVEX_AUTH_CONFIG,
} from '../../../src/runtime/utils/auth-config'
import { normalizeConvexRuntimeConfig } from '../../../src/runtime/utils/runtime-config'
import { shouldSkipProxyResponseHeader } from '../../../src/runtime/server/api/auth/headers'

describe('OWASP A05: Security Misconfiguration', () => {
  it('keeps the default auth posture enabled and return-path preserving', () => {
    expect(DEFAULT_CONVEX_AUTH_CONFIG.enabled).toBe(true)
    expect(DEFAULT_CONVEX_AUTH_CONFIG.routeProtection.preserveReturnTo).toBe(true)
    expect(DEFAULT_CONVEX_AUTH_CONFIG.unauthorized.enabled).toBe(false)
    expect(DEFAULT_CONVEX_AUTH_CONFIG.unauthorized.includeQueries).toBe(false)
  })

  it('normalizes auth-related runtime config to secure defaults', () => {
    const config = normalizeConvexRuntimeConfig({})

    expect(config.logging).toBe(false)
    expect(config.auth.cache.enabled).toBe(false)
    expect(config.auth.cache.ttl).toBe(60)
    expect(config.auth.proxy.maxRequestBodyBytes).toBe(1_048_576)
    expect(config.auth.proxy.maxResponseBodyBytes).toBe(1_048_576)
  })

  it('filters malformed origin and route entries out of runtime config', () => {
    const config = normalizeConvexRuntimeConfig({
      auth: {
        trustedOrigins: ['https://preview.example.com', 123, null],
        skipAuthRoutes: ['/health', 456, undefined],
      },
    })

    expect(config.auth.trustedOrigins).toEqual(['https://preview.example.com'])
    expect(config.auth.skipAuthRoutes).toEqual(['/health'])
  })

  it('strips response headers that could weaken proxy hardening', () => {
    expect(shouldSkipProxyResponseHeader('content-encoding')).toBe(true)
    expect(shouldSkipProxyResponseHeader('transfer-encoding')).toBe(true)
    expect(shouldSkipProxyResponseHeader('content-length')).toBe(true)
  })
})
