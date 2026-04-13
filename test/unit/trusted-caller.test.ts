import { v } from 'convex/values'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearTrustedCallerContext,
  getTrustedCaller,
  setTrustedCallerContext,
  withTrustedCaller,
  withTrustedCallerHandler,
} from '../../src/runtime/trusted-caller'

describe('trusted caller helpers', () => {
  beforeEach(() => {
    delete process.env.CONVEX_TRUSTED_CALLER_KEY
    clearTrustedCallerContext({})
  })

  it('widens runtime validators while keeping the public arg surface stable', () => {
    const args = withTrustedCaller({
      title: v.string(),
    })

    expect(Object.keys(args)).toEqual([
      'title',
      '_trustedCallerKey',
      '_trustedCaller',
      '_trustedCallerExpectedKey',
    ])
  })

  it('returns the trusted caller identity when the trusted caller key matches', () => {
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

  it('stores and clears trusted caller context for no-arg actor resolution', () => {
    process.env.CONVEX_TRUSTED_CALLER_KEY = 'trusted-key'
    const ctx: Record<string, unknown> = {}

    setTrustedCallerContext(ctx, {
      _trustedCallerKey: 'trusted-key',
      _trustedCaller: {
        userId: 'u_ctx',
      },
    })

    expect(getTrustedCaller(ctx)).toEqual({ userId: 'u_ctx' })

    clearTrustedCallerContext(ctx)
    expect(getTrustedCaller(ctx)).toBeNull()
  })

  it('accepts an explicit expected key override when process.env is unavailable', () => {
    const ctx: Record<string, unknown> = {}

    setTrustedCallerContext(
      ctx,
      {
        _trustedCallerKey: 'component-key',
        _trustedCaller: {
          userId: 'u_component',
        },
      },
      'component-key',
    )

    expect(getTrustedCaller(ctx)).toEqual({ userId: 'u_component' })
  })

  it('skips blank expected-key args and falls back to the configured environment key', () => {
    process.env.CONVEX_TRUSTED_CALLER_KEY = 'trusted-key'

    expect(
      getTrustedCaller({
        _trustedCallerKey: 'trusted-key',
        _trustedCaller: {
          userId: 'u_env',
        },
        _trustedCallerExpectedKey: '   ',
      }),
    ).toEqual({ userId: 'u_env' })
  })

  it('wraps handlers so trusted caller payload stays out of actor call sites', async () => {
    process.env.CONVEX_TRUSTED_CALLER_KEY = 'trusted-key'

    const handler = withTrustedCallerHandler(async (ctx) => getTrustedCaller(ctx))

    await expect(
      handler(
        {},
        {
          _trustedCallerKey: 'trusted-key',
          _trustedCaller: {
            userId: 'u_wrapped',
          },
        },
      ),
    ).resolves.toEqual({ userId: 'u_wrapped' })

    expect(getTrustedCaller({})).toBeNull()
  })

  it('wraps handlers with an explicit expected key override', async () => {
    const handler = withTrustedCallerHandler(async (ctx) => getTrustedCaller(ctx), 'component-key')

    await expect(
      handler(
        {},
        {
          _trustedCallerKey: 'component-key',
          _trustedCaller: {
            userId: 'u_override',
          },
        },
      ),
    ).resolves.toEqual({ userId: 'u_override' })
  })
})
