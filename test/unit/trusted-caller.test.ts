import { v } from 'convex/values'
import { beforeEach, describe, expect, it } from 'vitest'

import { getTrustedCaller, withTrustedCaller } from '../../src/runtime/trusted-caller'

describe('trusted caller helpers', () => {
  beforeEach(() => {
    delete process.env.CONVEX_TRUSTED_CALLER_KEY
  })

  it('widens runtime validators while keeping the public arg surface stable', () => {
    const args = withTrustedCaller({
      title: v.string(),
    })

    expect(Object.keys(args)).toEqual(['title', '_trustedCallerKey', '_trustedCaller'])
  })

  it('returns the trusted caller identity when the service key matches', () => {
    process.env.CONVEX_TRUSTED_CALLER_KEY = 'trusted-key'

    expect(
      getTrustedCaller({
        title: 'Hello',
        _trustedCallerKey: 'trusted-key',
        _trustedCaller: {
          userId: 'u_1',
        },
      }),
    ).toEqual({
      userId: 'u_1',
    })
  })

  it('returns null when no trusted caller transport is present', () => {
    expect(getTrustedCaller({ title: 'Hello' })).toBeNull()
  })

  it('throws on malformed trusted caller transport', () => {
    process.env.CONVEX_TRUSTED_CALLER_KEY = 'trusted-key'

    expect(() =>
      getTrustedCaller({
        _trustedCallerKey: 'trusted-key',
        _trustedCaller: {},
      }),
    ).toThrow(/Malformed trusted caller payload/)
  })
})
