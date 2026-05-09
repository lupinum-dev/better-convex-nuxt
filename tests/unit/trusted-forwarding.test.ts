import { v } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearTrustedForwardingContext,
  createTrustedForwardingEnvelope,
  getForwardedPrincipal,
  getForwardedDelegation,
  getTrustedForwarding,
  setTrustedForwardingContext,
  verifyTrustedForwardingKey,
  withTrustedForwarding,
} from '../../src/runtime/trusted-forwarding'
import { createTrustedForwardingEnvelopeArgs } from '../../src/runtime/trusted-forwarding/shared'

const originalNodeEnv = process.env.NODE_ENV

describe('trusted forwarding helpers', () => {
  beforeEach(() => {
    delete process.env.CONVEX_TRUSTED_FORWARDING_KEY
    delete process.env.CONVEX_TRUSTED_FORWARDING_KEY_ID
    clearTrustedForwardingContext({})
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('widens runtime validators while keeping the public arg surface stable', () => {
    const args = withTrustedForwarding({
      title: v.string(),
    })

    expect(Object.keys(args)).toEqual([
      'title',
      '_trellisForwarding',
      '_trustedForwardingKey',
      '_trustedForwarding',
    ])
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

  it('stores forwarded identity from a signed forwarding envelope without public identity args', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const ctx: Record<string, unknown> = {}
    const args = createTrustedForwardingEnvelopeArgs({
      args: { title: 'Envelope' },
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      delegation: { subject: 'user:u1', reason: 'approved' },
      functionRef: 'tasks:create',
      operation: 'mutation',
      jti: 'call-1',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    expect(args).toMatchObject({ title: 'Envelope' })
    expect(args).not.toHaveProperty('principal')
    expect(args).not.toHaveProperty('delegation')

    setTrustedForwardingContext(ctx, args, {
      expectedFunctionRef: 'tasks:create',
      now: Date.UTC(2026, 4, 9, 12, 0, 1),
    })

    expect(getTrustedForwarding(ctx)).toEqual({
      principalSubject: 'agent:a1',
      delegationSubject: 'user:u1',
    })
    expect(getForwardedPrincipal<{ kind: 'agent'; subject: string }>(ctx)).toEqual({
      kind: 'agent',
      agentId: 'a1',
      subject: 'agent:a1',
    })
    expect(getForwardedDelegation<{ subject: string; reason?: string }>(ctx)).toEqual({
      subject: 'user:u1',
      reason: 'approved',
    })
  })

  it('prefers signed forwarding envelopes over legacy raw forwarding fields', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const ctx: Record<string, unknown> = {}
    const args = createTrustedForwardingEnvelopeArgs({
      args: { title: 'Envelope' },
      principal: { kind: 'agent', agentId: 'signed', subject: 'agent:signed' },
      functionRef: 'tasks:create',
      operation: 'mutation',
      jti: 'call-1',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    setTrustedForwardingContext(
      ctx,
      {
        ...args,
        principal: { kind: 'agent', agentId: 'raw', subject: 'agent:raw' },
        _trustedForwardingKey: 'trusted-key-with-enough-alpha-entropy',
        _trustedForwarding: { principalSubject: 'agent:raw' },
      },
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(getTrustedForwarding(ctx)).toEqual({ principalSubject: 'agent:signed' })
    expect(getForwardedPrincipal<{ kind: 'agent'; subject: string }>(ctx)).toEqual({
      kind: 'agent',
      agentId: 'signed',
      subject: 'agent:signed',
    })
  })

  it('fails closed on invalid signed forwarding envelopes', () => {
    const now = Date.UTC(2026, 4, 9, 12, 0, 0)
    const key = 'trusted-key-with-enough-alpha-entropy'
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = key
    const base = {
      key,
      keyId: 'default',
      iss: 'trellis://server',
      aud: 'trellis://convex',
      jti: 'call-1',
      sub: 'agent:a1',
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      transport: 'server' as const,
      purpose: 'mutation' as const,
      functionRef: 'tasks:create',
      args: { title: 'Envelope' },
      now,
      ttlMs: 30_000,
    }

    const cases = [
      {
        label: 'unknown key',
        envelope: createTrustedForwardingEnvelope({ ...base, keyId: 'unknown' }),
        message: /unknown-key/,
      },
      {
        label: 'audience',
        envelope: createTrustedForwardingEnvelope({ ...base, aud: 'trellis://other' }),
        message: /audience/,
      },
      {
        label: 'function',
        envelope: createTrustedForwardingEnvelope({ ...base, functionRef: 'tasks:delete' }),
        message: /function-ref/,
      },
      {
        label: 'args',
        envelope: createTrustedForwardingEnvelope(base),
        args: { title: 'Changed' },
        message: /args-hash/,
      },
      {
        label: 'expired',
        envelope: createTrustedForwardingEnvelope({ ...base, ttlMs: 1 }),
        now: now + 30_000,
        message: /expired/,
      },
    ]

    for (const testCase of cases) {
      const ctx: Record<string, unknown> = {}
      expect(
        () =>
          setTrustedForwardingContext(
            ctx,
            {
              ...(testCase.args ?? base.args),
              _trellisForwarding: testCase.envelope,
            },
            {
              expectedFunctionRef: 'tasks:create',
              now: testCase.now ?? now + 1_000,
            },
          ),
        testCase.label,
      ).toThrow(testCase.message)
    }
  })

  it('fails closed on signed forwarding replay when redemption is required', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const seen = new Set<string>()
    const args = createTrustedForwardingEnvelopeArgs({
      args: { title: 'Envelope' },
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      functionRef: 'tasks:create',
      operation: 'mutation',
      purpose: 'operation-execute',
      jti: 'replay-call',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })
    const options = {
      expectedFunctionRef: 'tasks:create',
      now: Date.UTC(2026, 4, 9, 12, 0, 1),
      redeemJti: (jti: string) => {
        if (seen.has(jti)) return false
        seen.add(jti)
        return true
      },
    }

    expect(() => setTrustedForwardingContext({}, args, options)).not.toThrow()
    expect(() => setTrustedForwardingContext({}, args, options)).toThrow(/replayed/)
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

  it('rejects short trusted forwarding keys in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'short-prod-key'

    expect(() =>
      getTrustedForwarding({
        _trustedForwardingKey: 'short-prod-key',
        _trustedForwarding: {
          principalSubject: 'user:u_prod',
        },
      }),
    ).toThrow(/at least 32 characters/i)
  })

  it('rejects placeholder trusted forwarding keys in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'replace-me-with-a-long-random-shared-secret'

    expect(() =>
      getTrustedForwarding({
        _trustedForwardingKey: 'replace-me-with-a-long-random-shared-secret',
        _trustedForwarding: {
          principalSubject: 'user:u_prod',
        },
      }),
    ).toThrow(/development or placeholder value/i)
  })

  it('verifies trusted forwarding keys', () => {
    expect(verifyTrustedForwardingKey('abc', 'abc')).toBe(true)
    expect(verifyTrustedForwardingKey('abc', 'def')).toBe(false)
    expect(verifyTrustedForwardingKey('ab', 'abc')).toBe(false)
    expect(verifyTrustedForwardingKey('abcd', 'abc')).toBe(false)
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

  it('rejects forwarded principals whose explicit subject conflicts with their id fields', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key'
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(ctx, {
      principal: { kind: 'user', userId: 'victim', subject: 'user:attacker' },
      _trustedForwardingKey: 'trusted-key',
      _trustedForwarding: {
        principalSubject: 'user:attacker',
      },
    })

    expect(() =>
      getForwardedPrincipal<{ kind: 'user'; userId: string; subject: string }>(ctx),
    ).toThrow(/canonical subject/i)
  })
})
