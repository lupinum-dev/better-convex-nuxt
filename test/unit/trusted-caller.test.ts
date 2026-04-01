import { beforeEach, describe, expect, it } from 'vitest'
import { v } from 'convex/values'

import { getTrustedCaller, withTrustedCaller } from '../../src/runtime/auth'

describe('trusted caller helpers', () => {
  beforeEach(() => {
    delete process.env.CONVEX_SERVICE_KEY
  })

  it('widens runtime validators while keeping the public arg surface stable', () => {
    const args = withTrustedCaller({
      title: v.string(),
    })

    expect(Object.keys(args)).toEqual(['title', '_serviceKey', '_serviceActor'])
  })

  it('returns the trusted caller identity when the service key matches', () => {
    process.env.CONVEX_SERVICE_KEY = 'trusted-key'

    expect(getTrustedCaller({
      title: 'Hello',
      _serviceKey: 'trusted-key',
      _serviceActor: {
        userId: 'u_1',
        role: 'admin',
        tenantId: 'org_1',
      },
    })).toEqual({
      userId: 'u_1',
      role: 'admin',
      tenantId: 'org_1',
    })
  })

  it('returns null when no trusted caller transport is present', () => {
    expect(getTrustedCaller({ title: 'Hello' })).toBeNull()
  })

  it('throws on malformed trusted caller transport', () => {
    process.env.CONVEX_SERVICE_KEY = 'trusted-key'

    expect(() => getTrustedCaller({
      _serviceKey: 'trusted-key',
      _serviceActor: {
        role: 'admin',
      },
    })).toThrow(/Malformed trusted caller payload/)
  })
})
