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

  it('installs auth with defaults for an empty config', () => {
    const config = normalizeConvexRuntimeConfig({})
    expect(config.auth).not.toBe(false)
    if (config.auth === false) throw new Error('expected auth enabled')
    expect(config.auth.publicOrigin).toBe('')
    expect(config.auth.proxy.trustedClientIpHeader).toBe('')
  })

  it('disables auth entirely when auth is false', () => {
    const config = normalizeConvexRuntimeConfig({ auth: false })
    expect(config.auth).toBe(false)
  })

  it('uses explicit upload maxConcurrent when valid', () => {
    const config = normalizeConvexRuntimeConfig({
      upload: { maxConcurrent: 5 },
    })
    expect(config.upload.maxConcurrent).toBe(5)
  })

  it('normalizes invalid upload maxConcurrent values', () => {
    expect(
      normalizeConvexRuntimeConfig({ upload: { maxConcurrent: 0 } }).upload.maxConcurrent,
    ).toBe(1)
    expect(
      normalizeConvexRuntimeConfig({ upload: { maxConcurrent: 4.8 } }).upload.maxConcurrent,
    ).toBe(4)
    expect(
      normalizeConvexRuntimeConfig({ upload: { maxConcurrent: Number.NaN } }).upload.maxConcurrent,
    ).toBe(3)
  })

  it('defaults auth proxy body-size limits to 1 MiB', () => {
    const config = normalizeConvexRuntimeConfig({})
    if (config.auth === false) throw new Error('expected auth enabled')
    expect(config.auth.proxy.maxRequestBodyBytes).toBe(1_048_576)
    expect(config.auth.proxy.maxResponseBodyBytes).toBe(1_048_576)
  })

  it('uses explicit auth proxy limits when valid', () => {
    const config = normalizeConvexRuntimeConfig({
      auth: {
        proxy: { maxRequestBodyBytes: 2048, maxResponseBodyBytes: 4096 },
      },
    })
    if (config.auth === false) throw new Error('expected auth enabled')
    expect(config.auth.proxy.maxRequestBodyBytes).toBe(2048)
    expect(config.auth.proxy.maxResponseBodyBytes).toBe(4096)
  })

  it('validates and retains the configured public auth origin', () => {
    const config = normalizeConvexRuntimeConfig({
      auth: {
        publicOrigin: 'https://app.example.test/',
        proxy: { trustedClientIpHeader: 'cf-connecting-ip' },
      },
    })
    if (config.auth === false) throw new Error('expected auth enabled')
    expect(config.auth.publicOrigin).toBe('https://app.example.test')
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

  it.each([
    'https://user:pass@example.convex.cloud',
    'https://example.convex.cloud/path',
    'https://example.convex.cloud?target=private',
    'https://example.convex.cloud#fragment',
    'http://example.convex.cloud',
    'file:///tmp/convex',
  ])('rejects unsafe Convex deployment URLs before client construction: %s', (url) => {
    expect(() => normalizeConvexRuntimeConfig({ url })).toThrow()
  })

  it.each([
    ['https://example.convex.cloud/', 'https://example.convex.cloud'],
    ['http://localhost:3210/', 'http://localhost:3210'],
    ['http://[::1]:3210', 'http://[::1]:3210'],
  ])('normalizes exact deployment origin %s', (url, expected) => {
    expect(normalizeConvexRuntimeConfig({ url }).url).toBe(expected)
  })

  it.each(['http://127.42.0.1:3210', 'http://app.localhost:3210', 'http://2130706433:3210'])(
    'rejects a non-exact loopback deployment URL: %s',
    (url) => {
      expect(() => normalizeConvexRuntimeConfig({ url })).toThrow()
    },
  )
})
