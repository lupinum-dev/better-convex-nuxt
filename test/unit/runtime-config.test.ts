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
    expect(config.auth.cache.ttl).toBe(60)
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
})
