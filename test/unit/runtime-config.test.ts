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

  it('uses explicit upload maxConcurrent when valid', () => {
    const config = normalizeConvexRuntimeConfig({
      upload: {
        maxConcurrent: 5,
      },
    })
    expect(config.upload.maxConcurrent).toBe(5)
  })

  it('normalizes invalid upload maxConcurrent values', () => {
    expect(normalizeConvexRuntimeConfig({
      upload: { maxConcurrent: 0 },
    }).upload.maxConcurrent).toBe(1)

    expect(normalizeConvexRuntimeConfig({
      upload: { maxConcurrent: 4.8 },
    }).upload.maxConcurrent).toBe(4)

    expect(normalizeConvexRuntimeConfig({
      upload: { maxConcurrent: Number.NaN },
    }).upload.maxConcurrent).toBe(3)
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

  it('uses query default unauthenticated flag', () => {
    const config = normalizeConvexRuntimeConfig({
      defaults: {
        unauthenticated: true,
      },
    })
    expect(config.defaults.unauthenticated).toBe(true)
  })

  it('does not map deprecated defaults.public to unauthenticated', () => {
    const config = normalizeConvexRuntimeConfig({
      defaults: {
        public: true,
      },
    })
    expect(config.defaults.unauthenticated).toBe(false)
  })
})
