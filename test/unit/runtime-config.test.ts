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
})
