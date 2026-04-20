import { describe, expect, it, vi } from 'vitest'

import { normalizeConvexRuntimeConfig } from '../../src/runtime/convex/shared/runtime-config'

vi.mock('#imports', () => ({
  useRuntimeConfig: vi.fn(() => ({ public: { convex: {} } })),
}))

describe('runtime config normalization', () => {
  it('defaults upload maxConcurrent to 3', () => {
    const config = normalizeConvexRuntimeConfig({})
    expect(config.upload.maxConcurrent).toBe(3)
  })

  it('defaults auth cache ttl to 60 seconds', () => {
    const config = normalizeConvexRuntimeConfig({})
    expect(config.auth.cache.ttl).toBe(60)
  })

  it('keeps MCP runtime config empty by default', () => {
    const config = normalizeConvexRuntimeConfig({})
    expect(config.mcp).toEqual({})
  })

  it('clamps auth cache ttl to 1..60 seconds', () => {
    expect(
      normalizeConvexRuntimeConfig({
        auth: { cache: { ttl: 0 } },
      }).auth.cache.ttl,
    ).toBe(1)

    expect(
      normalizeConvexRuntimeConfig({
        auth: { cache: { ttl: 999 } },
      }).auth.cache.ttl,
    ).toBe(60)
  })

  it('uses explicit upload maxConcurrent when valid', () => {
    const config = normalizeConvexRuntimeConfig({
      upload: {
        maxConcurrent: 5,
      },
    })
    expect(config.upload.maxConcurrent).toBe(5)
  })

  it('normalizes invalid upload maxConcurrent values', () => {
    expect(
      normalizeConvexRuntimeConfig({
        upload: { maxConcurrent: 0 },
      }).upload.maxConcurrent,
    ).toBe(1)

    expect(
      normalizeConvexRuntimeConfig({
        upload: { maxConcurrent: 4.8 },
      }).upload.maxConcurrent,
    ).toBe(4)

    expect(
      normalizeConvexRuntimeConfig({
        upload: { maxConcurrent: Number.NaN },
      }).upload.maxConcurrent,
    ).toBe(3)
  })

  it('defaults auth proxy body-size limits to 1 MiB', () => {
    const config = normalizeConvexRuntimeConfig({})
    expect(config.auth.proxy.maxRequestBodyBytes).toBe(1_048_576)
    expect(config.auth.proxy.maxResponseBodyBytes).toBe(1_048_576)
    expect(typeof config.observability.enabled).toBe('boolean')
  })

  it('uses explicit auth proxy limits when valid', () => {
    const config = normalizeConvexRuntimeConfig({
      auth: {
        proxy: {
          maxRequestBodyBytes: 2048,
          maxResponseBodyBytes: 4096,
        },
      },
    })
    expect(config.auth.proxy.maxRequestBodyBytes).toBe(2048)
    expect(config.auth.proxy.maxResponseBodyBytes).toBe(4096)
  })

  it('normalizes observability config', () => {
    const config = normalizeConvexRuntimeConfig({
      observability: {
        enabled: true,
        service: 'runtime-config-test',
        level: 'normal',
        capture: {
          backend: true,
          mcp: true,
          browser: false,
        },
        sample: {
          browser: 0.25,
        },
        correlation: {
          header: 'x-correlation-id',
        },
      },
    })

    expect(config.observability.enabled).toBe(true)
    expect(config.observability.level).toBe('normal')
    expect(config.observability.service).toBe('runtime-config-test')
    expect(config.observability.capture.browser).toBe(false)
    expect(config.observability.sample.browser).toBe(0.25)
    expect(config.observability.correlation.header).toBe('x-correlation-id')
  })

  it('uses production observability defaults when NODE_ENV=production', () => {
    const previousEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    const config = normalizeConvexRuntimeConfig({})

    expect(config.observability.enabled).toBe(true)
    expect(config.observability.level).toBe('critical')
    expect(config.observability.capture.backend).toBe(true)
    expect(config.observability.capture.mcp).toBe(true)
    expect(config.observability.capture.browser).toBe(false)

    process.env.NODE_ENV = previousEnv
  })

  it('rejects shared-host wildcard trusted origins during normalization', () => {
    expect(() =>
      normalizeConvexRuntimeConfig({
        auth: {
          trustedOrigins: ['https://preview-*.vercel.app'],
        },
      }),
    ).toThrow(/Wildcard trusted origin/)
  })

  it('allows exact trusted origins on shared-host preview domains', () => {
    const config = normalizeConvexRuntimeConfig({
      auth: {
        trustedOrigins: ['https://preview-123.vercel.app'],
      },
    })

    expect(config.auth.trustedOrigins).toEqual(['https://preview-123.vercel.app'])
  })
})
