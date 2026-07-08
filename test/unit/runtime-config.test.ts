import { describe, expect, it, vi } from 'vitest'

import { normalizeConvexRuntimeConfig } from '../../src/runtime/utils/runtime-config'

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
    expect(config.authCache.ttl).toBe(60)
  })

  it('clamps auth cache ttl to 1..60 seconds', () => {
    expect(
      normalizeConvexRuntimeConfig({
        authCache: { ttl: 0 },
      }).authCache.ttl,
    ).toBe(1)

    expect(
      normalizeConvexRuntimeConfig({
        authCache: { ttl: 999 },
      }).authCache.ttl,
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
    expect(config.authProxy.maxRequestBodyBytes).toBe(1_048_576)
    expect(config.authProxy.maxResponseBodyBytes).toBe(1_048_576)
  })

  it('uses explicit auth proxy limits when valid', () => {
    const config = normalizeConvexRuntimeConfig({
      authProxy: {
        maxRequestBodyBytes: 2048,
        maxResponseBodyBytes: 4096,
      },
    })
    expect(config.authProxy.maxRequestBodyBytes).toBe(2048)
    expect(config.authProxy.maxResponseBodyBytes).toBe(4096)
  })

  it('uses query default auth mode', () => {
    const config = normalizeConvexRuntimeConfig({
      defaults: {
        auth: 'none',
      },
    })
    expect(config.defaults.auth).toBe('none')
  })

  it('does not map deprecated defaults.public to auth mode', () => {
    const config = normalizeConvexRuntimeConfig({
      defaults: {
        public: true,
      },
    })
    expect(config.defaults.auth).toBe('auto')
  })

  it('defaults query waitTimeoutMs to 10000ms', () => {
    expect(normalizeConvexRuntimeConfig({}).defaults.waitTimeoutMs).toBe(10_000)
  })

  it('accepts an explicit waitTimeoutMs (including 0 to disable) and rejects invalid values', () => {
    expect(
      normalizeConvexRuntimeConfig({ defaults: { waitTimeoutMs: 2500 } }).defaults.waitTimeoutMs,
    ).toBe(2500)
    expect(
      normalizeConvexRuntimeConfig({ defaults: { waitTimeoutMs: 0 } }).defaults.waitTimeoutMs,
    ).toBe(0)
    expect(
      normalizeConvexRuntimeConfig({ defaults: { waitTimeoutMs: -5 } }).defaults.waitTimeoutMs,
    ).toBe(10_000)
    expect(
      normalizeConvexRuntimeConfig({ defaults: { waitTimeoutMs: Number.NaN } }).defaults
        .waitTimeoutMs,
    ).toBe(10_000)
  })
})
