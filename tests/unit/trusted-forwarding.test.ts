import { v } from 'convex/values'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearTrustedForwardingContext,
  getForwardedPrincipal,
  getForwardedDelegation,
  getTrustedForwarding,
  setTrustedForwardingContext,
  verifyTrustedForwardingKey,
  withTrustedForwarding,
} from '../../src/runtime/trusted-forwarding'

describe('trusted forwarding helpers', () => {
  beforeEach(() => {
    delete process.env.CONVEX_TRUSTED_FORWARDING_KEY
    clearTrustedForwardingContext({})
  })

  it('widens runtime validators while keeping the public arg surface stable', () => {
    const args = withTrustedForwarding({
      title: v.string(),
    })

    expect(Object.keys(args)).toEqual(['title', '_trustedForwardingKey', '_trustedForwarding'])
  })

  it('returns the trusted forwarding identity when the trusted forwarding key matches', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'

    expect(
      getTrustedForwarding({
        title: 'Hello',
        _trustedForwardingKey: 'trusted-key',
        _trustedForwarding: {
          principalSubject: 'user:u_1',
        },
      }),
    ).toEqual({
      principalSubject: 'user:u_1',
    })
  })

  it('returns null when no trusted forwarding transport is present', () => {
    expect(getTrustedForwarding({ title: 'Hello' })).toBeNull()
  })

  it('throws on malformed trusted forwarding transport', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'

    expect(() =>
      getTrustedForwarding({
        _trustedForwardingKey: 'trusted-key',
        _trustedForwarding: {},
      }),
    ).toThrow(/Malformed trusted forwarding payload/)
  })

  it('rejects non-canonical trusted forwarding subjects', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'

    expect(() =>
      getTrustedForwarding({
        _trustedForwardingKey: 'trusted-key',
        _trustedForwarding: {
          principalSubject: 'not-a-subject',
        },
      }),
    ).toThrow(/Malformed trusted forwarding payload/)
  })

  it('stores and clears trusted forwarding context for no-arg actor resolution', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(ctx, {
      _trustedForwardingKey: 'trusted-key',
      _trustedForwarding: {
        principalSubject: 'user:u_ctx',
      },
    })

    expect(getTrustedForwarding(ctx)).toEqual({ principalSubject: 'user:u_ctx' })

    clearTrustedForwardingContext(ctx)
    expect(getTrustedForwarding(ctx)).toBeNull()
  })

  it('accepts an explicit expected key override when process.env is unavailable', () => {
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(
      ctx,
      {
        _trustedForwardingKey: 'component-key',
        _trustedForwarding: {
          principalSubject: 'user:u_component',
        },
      },
      'component-key',
    )

    expect(getTrustedForwarding(ctx)).toEqual({ principalSubject: 'user:u_component' })
  })

  it('rejects trusted forwarding payloads when no server-owned key exists', () => {
    expect(() =>
      getTrustedForwarding({
        _trustedForwardingKey: 'forged-key',
        _trustedForwarding: {
          principalSubject: 'user:u_env',
        },
      }),
    ).toThrow(/Trusted forwarding auth is not configured/i)
  })

  it('verifies trusted forwarding keys', () => {
    expect(verifyTrustedForwardingKey('abc', 'abc')).toBe(true)
    expect(verifyTrustedForwardingKey('abc', 'def')).toBe(false)
  })

  it('rejects forwarded principal reads on untrusted paths', () => {
    expect(() =>
      getForwardedPrincipal({}, { principal: { kind: 'agent', subject: 'agent:u_1' } }),
    ).toThrow(/only allowed on verified trusted forwarding paths/i)
  })

  it('returns forwarded principal and delegation on verified trusted forwarding paths', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(ctx, {
      principal: { kind: 'agent', subject: 'agent:agent_1' },
      delegation: { subject: 'user:u_forwarded', reason: 'approved' },
      _trustedForwardingKey: 'trusted-key',
      _trustedForwarding: {
        principalSubject: 'agent:agent_1',
        delegationSubject: 'user:u_forwarded',
      },
    })

    expect(
      getForwardedPrincipal<{ kind: 'agent'; subject: string }>(ctx, {
        principal: { kind: 'agent', subject: 'agent:agent_1' },
      }),
    ).toEqual({ kind: 'agent', subject: 'agent:agent_1' })
    expect(
      getForwardedDelegation<{ subject: string; reason?: string }>(ctx, {
        delegation: { subject: 'user:u_forwarded', reason: 'approved' },
      }),
    ).toEqual({ subject: 'user:u_forwarded', reason: 'approved' })
  })

  it('returns stored forwarded identity from context even when resolver args are sanitized', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(ctx, {
      principal: { kind: 'agent', subject: 'agent:agent_1' },
      delegation: { subject: 'user:u_forwarded', reason: 'approved' },
      _trustedForwardingKey: 'trusted-key',
      _trustedForwarding: {
        principalSubject: 'agent:agent_1',
        delegationSubject: 'user:u_forwarded',
      },
    })

    expect(getForwardedPrincipal<{ kind: 'agent'; subject: string }>(ctx)).toEqual({
      kind: 'agent',
      subject: 'agent:agent_1',
    })
    expect(getForwardedDelegation<{ subject: string; reason?: string }>(ctx)).toEqual({
      subject: 'user:u_forwarded',
      reason: 'approved',
    })
  })

  it('returns null when no forwarded delegation is present', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(ctx, {
      principal: { kind: 'agent', subject: 'agent:agent_1' },
      _trustedForwardingKey: 'trusted-key',
      _trustedForwarding: {
        principalSubject: 'agent:agent_1',
      },
    })

    expect(getForwardedDelegation<{ subject: string }>(ctx)).toBeNull()
  })

  it('rejects mismatched forwarded principal and delegation payloads', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(ctx, {
      principal: { kind: 'agent', subject: 'agent:other' },
      delegation: { subject: 'user:other' },
      _trustedForwardingKey: 'trusted-key',
      _trustedForwarding: {
        principalSubject: 'agent:agent_1',
        delegationSubject: 'user:u_forwarded',
      },
    })

    expect(() => getForwardedPrincipal<{ kind: 'agent'; subject: string }>(ctx)).toThrow(
      /principal` subject does not match/i,
    )
    expect(() => getForwardedDelegation<{ subject: string }>(ctx)).toThrow(
      /delegation` subject does not match/i,
    )
  })
})
