import { v } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearTrustedForwardingContext,
  createTrustedForwardingEnvelope,
  getForwardedPrincipal,
  getForwardedDelegation,
  getTrustedForwarding,
  setTrustedForwardingContext,
  withTrustedForwarding,
} from '../../src/runtime/trusted-forwarding'
import { createTrustedForwardingEnvelopeArgs } from '../../src/runtime/trusted-forwarding/shared'

const originalNodeEnv = process.env.NODE_ENV
const trustedForwardingKey = 'trusted-key-with-enough-alpha-entropy'

function signedArgs({
  args = {},
  principal = { kind: 'agent', agentId: 'agent_1', subject: 'agent:agent_1' },
  delegation,
  functionRef = 'tasks:create',
  operation = 'mutation',
}: {
  args?: Record<string, unknown>
  principal?: { subject: string } & Record<string, unknown>
  delegation?: { subject: string } & Record<string, unknown>
  functionRef?: string
  operation?: 'query' | 'mutation' | 'action'
} = {}) {
  process.env.CONVEX_TRUSTED_FORWARDING_KEY = trustedForwardingKey
  return createTrustedForwardingEnvelopeArgs({
    args,
    principal,
    ...(delegation ? { delegation } : {}),
    functionRef,
    operation,
    jti: `call-${functionRef}`,
    now: Date.UTC(2026, 4, 9, 12, 0, 0),
  })
}

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

    expect(Object.keys(args)).toEqual(['title', '_trellisForwarding'])
  })

  it('returns the trusted forwarding identity from a signed envelope', () => {
    const ctx: Record<string, unknown> = {}
    setTrustedForwardingContext(
      ctx,
      signedArgs({
        args: { title: 'Hello' },
        principal: { kind: 'user', userId: 'u_1', subject: 'user:u_1' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(getTrustedForwarding(ctx)).toEqual({
      principalSubject: 'user:u_1',
    })
  })

  it('can verify component-boundary forwarding with an explicit component-side key', () => {
    const ctx: Record<string, unknown> = {}
    const args = signedArgs({
      args: { title: 'Hello' },
      principal: { kind: 'user', userId: 'u_component', subject: 'user:u_component' },
    })
    const key = process.env.CONVEX_TRUSTED_FORWARDING_KEY
    delete process.env.CONVEX_TRUSTED_FORWARDING_KEY

    setTrustedForwardingContext(ctx, args, {
      expectedKeyOverride: key,
      expectedFunctionRef: 'tasks:create',
      now: Date.UTC(2026, 4, 9, 12, 0, 1),
    })

    expect(getTrustedForwarding(ctx)).toEqual({
      principalSubject: 'user:u_component',
    })
  })

  it('returns null when no trusted forwarding transport is present', () => {
    expect(getTrustedForwarding({ title: 'Hello' })).toBeNull()
  })

  it('throws on malformed trusted forwarding transport', () => {
    expect(() =>
      getTrustedForwarding({
        _trellisForwarding: {},
      }),
    ).toThrow(/Malformed trusted forwarding envelope/)
  })

  it('ignores deleted raw trusted forwarding fields', () => {
    expect(() => getTrustedForwarding({ _trustedForwardingKey: 'trusted-key' })).not.toThrow()
    expect(
      getTrustedForwarding({
        _trustedForwardingKey: 'trusted-key',
        _trustedForwarding: { principalSubject: 'user:u_1' },
      }),
    ).toBeNull()
  })

  it('stores and clears trusted forwarding context for no-arg actor resolution', () => {
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(
      ctx,
      signedArgs({
        principal: { kind: 'user', userId: 'u_ctx', subject: 'user:u_ctx' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

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

  it('treats deleted raw forwarding fields as normal args for signed envelopes', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const ctx: Record<string, unknown> = {}
    const args = createTrustedForwardingEnvelopeArgs({
      args: {
        title: 'Envelope',
        _trustedForwardingKey: 'business',
        _trustedForwarding: { principalSubject: 'business' },
      },
      principal: { kind: 'agent', agentId: 'signed', subject: 'agent:signed' },
      functionRef: 'tasks:create',
      operation: 'mutation',
      jti: 'call-1',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    setTrustedForwardingContext(ctx, args, {
      expectedFunctionRef: 'tasks:create',
      now: Date.UTC(2026, 4, 9, 12, 0, 1),
    })

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

  it('fails closed on oversized signed forwarding envelopes', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const args = createTrustedForwardingEnvelopeArgs({
      args: { title: 'Envelope' },
      principal: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      functionRef: 'tasks:create',
      operation: 'mutation',
      jti: 'oversized-call',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    expect(() =>
      setTrustedForwardingContext({}, args, {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
        maxEnvelopeBytes: 64,
      }),
    ).toThrow(/too-large/)
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

  it('fails closed when operation preview and execute purposes are used on the wrong path', () => {
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const previewArgs = createTrustedForwardingEnvelopeArgs({
      args: { id: 'project-1' },
      principal: { kind: 'agent', agentId: 'assistant', subject: 'agent:assistant' },
      functionRef: 'projects:previewDelete',
      operation: 'query',
      purpose: 'operation-preview',
      jti: 'preview-call',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })
    const executeArgs = createTrustedForwardingEnvelopeArgs({
      args: { id: 'project-1', _confirmationToken: 'confirmed' },
      principal: { kind: 'agent', agentId: 'assistant', subject: 'agent:assistant' },
      functionRef: 'projects:delete',
      operation: 'mutation',
      purpose: 'operation-execute',
      jti: 'execute-call',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    expect(() =>
      setTrustedForwardingContext({}, executeArgs, {
        expectedFunctionRef: 'projects:delete',
        expectedPurpose: 'operation-preview',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      }),
    ).toThrow(/purpose/)
    expect(() =>
      setTrustedForwardingContext({}, previewArgs, {
        expectedFunctionRef: 'projects:previewDelete',
        expectedPurpose: 'operation-execute',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      }),
    ).toThrow(/purpose/)
  })

  it('accepts an explicit expected key override when process.env is unavailable', () => {
    const ctx: Record<string, unknown> = {}

    const args = createTrustedForwardingEnvelopeArgs({
      args: { title: 'Component' },
      principal: { kind: 'user', userId: 'u_component', subject: 'user:u_component' },
      functionRef: 'tasks:create',
      operation: 'mutation',
      key: 'component-key',
      jti: 'component-call',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    setTrustedForwardingContext(ctx, args, {
      expectedKeyOverride: 'component-key',
      expectedFunctionRef: 'tasks:create',
      now: Date.UTC(2026, 4, 9, 12, 0, 1),
    })

    expect(getTrustedForwarding(ctx)).toEqual({ principalSubject: 'user:u_component' })
  })

  it('does not trust a key carried in args unless the runtime explicitly opts into it', () => {
    const ctx: Record<string, unknown> = {}
    const args = { title: 'Forged component call' }
    const callerChosenKey = 'caller-chosen-forwarding-key-with-enough-entropy'
    const envelope = createTrustedForwardingEnvelope({
      key: callerChosenKey,
      keyId: 'default',
      iss: 'trellis://server',
      aud: 'trellis://convex',
      jti: 'forged-key-in-args',
      sub: 'user:u_forged',
      principal: { kind: 'user', userId: 'u_forged', subject: 'user:u_forged' },
      transport: 'bridge',
      purpose: 'mutation',
      functionRef: 'tasks:create',
      args,
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
      ttlMs: 30_000,
    })

    expect(() =>
      setTrustedForwardingContext(
        ctx,
        {
          ...args,
          _trellisForwarding: envelope,
          _trellisForwardingKey: callerChosenKey,
        },
        {
          expectedFunctionRef: 'tasks:create',
          expectedTransport: 'bridge',
          now: Date.UTC(2026, 4, 9, 12, 0, 1),
        },
      ),
    ).toThrow(/Trusted forwarding auth is not configured/)
  })

  it('rejects short trusted forwarding keys in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'short-prod-key'

    expect(() =>
      createTrustedForwardingEnvelopeArgs({
        args: { title: 'Envelope' },
        principal: { kind: 'user', userId: 'u_prod', subject: 'user:u_prod' },
        functionRef: 'tasks:create',
        operation: 'mutation',
      }),
    ).toThrow(/at least 32 characters/i)
  })

  it('rejects placeholder trusted forwarding keys in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.CONVEX_TRUSTED_FORWARDING_KEY = 'replace-me-with-a-long-random-shared-secret'

    expect(() =>
      createTrustedForwardingEnvelopeArgs({
        args: { title: 'Envelope' },
        principal: { kind: 'user', userId: 'u_prod', subject: 'user:u_prod' },
        functionRef: 'tasks:create',
        operation: 'mutation',
      }),
    ).toThrow(/development or placeholder value/i)
  })

  it('rejects forwarded principal reads on untrusted paths', () => {
    expect(() =>
      getForwardedPrincipal({}, { principal: { kind: 'agent', subject: 'agent:u_1' } }),
    ).toThrow(/only allowed on verified trusted forwarding paths/i)
  })

  it('returns forwarded principal and delegation on verified trusted forwarding paths', () => {
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(
      ctx,
      signedArgs({
        principal: { kind: 'agent', subject: 'agent:agent_1' },
        delegation: { subject: 'user:u_forwarded', reason: 'approved' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

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
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(
      ctx,
      signedArgs({
        principal: { kind: 'agent', subject: 'agent:agent_1' },
        delegation: { subject: 'user:u_forwarded', reason: 'approved' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

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
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(
      ctx,
      signedArgs({
        principal: { kind: 'agent', subject: 'agent:agent_1' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(getForwardedDelegation<{ subject: string }>(ctx)).toBeNull()
  })

  it('rejects mismatched forwarded principal and delegation payloads', () => {
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(
      ctx,
      signedArgs({
        principal: { kind: 'agent', subject: 'agent:agent_1' },
        delegation: { subject: 'user:u_forwarded' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(() =>
      getForwardedPrincipal<{ kind: 'agent'; subject: string }>(
        ctx,
        { actor: { kind: 'agent', subject: 'agent:other' } },
        'actor',
      ),
    ).toThrow(/principal` subject does not match/i)
    expect(() =>
      getForwardedDelegation<{ subject: string }>(
        ctx,
        { target: { subject: 'user:other' } },
        'target',
      ),
    ).toThrow(/delegation` subject does not match/i)
  })

  it('rejects forwarded principals whose explicit subject conflicts with their id fields', () => {
    const ctx: Record<string, unknown> = {}

    setTrustedForwardingContext(
      ctx,
      signedArgs({
        principal: { kind: 'user', userId: 'attacker', subject: 'user:attacker' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(() =>
      getForwardedPrincipal<{ kind: 'user'; userId: string; subject: string }>(
        ctx,
        { actor: { kind: 'user', userId: 'victim', subject: 'user:attacker' } },
        'actor',
      ),
    ).toThrow(/canonical subject/i)
  })
})
