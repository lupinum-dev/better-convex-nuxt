import { v } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearIdentityForwardingContext,
  createIdentityForwardingEnvelope,
  getForwardedCaller,
  getForwardedActingFor,
  getIdentityForwarding,
  setIdentityForwardingContext,
  withIdentityForwarding,
} from '../../src/runtime/identity-forwarding'
import { createIdentityForwardingEnvelopeArgs } from '../../src/runtime/identity-forwarding/shared'

const originalNodeEnv = process.env.NODE_ENV
const identityForwardingKey = 'trusted-key-with-enough-alpha-entropy'

function signedArgs({
  args = {},
  caller = { kind: 'agent', agentId: 'agent_1', subject: 'agent:agent_1' },
  actingFor,
  functionRef = 'tasks:create',
  operation = 'mutation',
}: {
  args?: Record<string, unknown>
  caller?: { subject: string } & Record<string, unknown>
  actingFor?: { subject: string } & Record<string, unknown>
  functionRef?: string
  operation?: 'query' | 'mutation' | 'action'
} = {}) {
  process.env.CONVEX_IDENTITY_FORWARDING_KEY = identityForwardingKey
  return createIdentityForwardingEnvelopeArgs({
    args,
    caller,
    ...(actingFor ? { actingFor } : {}),
    functionRef,
    operation,
    jti: `call-${functionRef}`,
    now: Date.UTC(2026, 4, 9, 12, 0, 0),
  })
}

describe('identity forwarding helpers', () => {
  beforeEach(() => {
    delete process.env.CONVEX_IDENTITY_FORWARDING_KEY
    delete process.env.CONVEX_IDENTITY_FORWARDING_KEY_ID
    clearIdentityForwardingContext({})
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('widens runtime validators while keeping the public arg surface stable', () => {
    const args = withIdentityForwarding({
      title: v.string(),
    })

    expect(Object.keys(args)).toEqual(['title', '_trellisForwarding'])
  })

  it('returns the identity forwarding identity from a signed envelope', () => {
    const ctx: Record<string, unknown> = {}
    setIdentityForwardingContext(
      ctx,
      signedArgs({
        args: { title: 'Hello' },
        caller: { kind: 'user', userId: 'u_1', subject: 'user:u_1' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(getIdentityForwarding(ctx)).toEqual({
      principalSubject: 'user:u_1',
    })
  })

  it('can verify component-boundary forwarding with an explicit component-side key', () => {
    const ctx: Record<string, unknown> = {}
    const args = signedArgs({
      args: { title: 'Hello' },
      caller: { kind: 'user', userId: 'u_component', subject: 'user:u_component' },
    })
    const key = process.env.CONVEX_IDENTITY_FORWARDING_KEY
    delete process.env.CONVEX_IDENTITY_FORWARDING_KEY

    setIdentityForwardingContext(ctx, args, {
      expectedKeyOverride: key,
      expectedFunctionRef: 'tasks:create',
      now: Date.UTC(2026, 4, 9, 12, 0, 1),
    })

    expect(getIdentityForwarding(ctx)).toEqual({
      principalSubject: 'user:u_component',
    })
  })

  it('returns null when no identity forwarding transport is present', () => {
    expect(getIdentityForwarding({ title: 'Hello' })).toBeNull()
  })

  it('throws on malformed identity forwarding transport', () => {
    expect(() =>
      getIdentityForwarding({
        _trellisForwarding: {},
      }),
    ).toThrow(/Malformed identity forwarding envelope/)
  })

  it('ignores deleted raw identity forwarding fields', () => {
    expect(() => getIdentityForwarding({ _identityForwardingKey: 'trusted-key' })).not.toThrow()
    expect(
      getIdentityForwarding({
        _identityForwardingKey: 'trusted-key',
        _identityForwarding: { principalSubject: 'user:u_1' },
      }),
    ).toBeNull()
  })

  it('stores and clears identity forwarding context for no-arg appIdentity resolution', () => {
    const ctx: Record<string, unknown> = {}

    setIdentityForwardingContext(
      ctx,
      signedArgs({
        caller: { kind: 'user', userId: 'u_ctx', subject: 'user:u_ctx' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(getIdentityForwarding(ctx)).toEqual({ principalSubject: 'user:u_ctx' })

    clearIdentityForwardingContext(ctx)
    expect(getIdentityForwarding(ctx)).toBeNull()
  })

  it('stores forwarded identity from a signed forwarding envelope without public identity args', () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const ctx: Record<string, unknown> = {}
    const args = createIdentityForwardingEnvelopeArgs({
      args: { title: 'Envelope' },
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      actingFor: { subject: 'user:u1', reason: 'approved' },
      functionRef: 'tasks:create',
      operation: 'mutation',
      jti: 'call-1',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    expect(args).toMatchObject({ title: 'Envelope' })
    expect(args).not.toHaveProperty('caller')
    expect(args).not.toHaveProperty('actingFor')

    setIdentityForwardingContext(ctx, args, {
      expectedFunctionRef: 'tasks:create',
      now: Date.UTC(2026, 4, 9, 12, 0, 1),
    })

    expect(getIdentityForwarding(ctx)).toEqual({
      principalSubject: 'agent:a1',
      delegationSubject: 'user:u1',
    })
    expect(getForwardedCaller<{ kind: 'agent'; subject: string }>(ctx)).toEqual({
      kind: 'agent',
      agentId: 'a1',
      subject: 'agent:a1',
    })
    expect(getForwardedActingFor<{ subject: string; reason?: string }>(ctx)).toEqual({
      subject: 'user:u1',
      reason: 'approved',
    })
  })

  it('treats deleted raw forwarding fields as normal args for signed envelopes', () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const ctx: Record<string, unknown> = {}
    const args = createIdentityForwardingEnvelopeArgs({
      args: {
        title: 'Envelope',
        _identityForwardingKey: 'business',
        _identityForwarding: { principalSubject: 'business' },
      },
      caller: { kind: 'agent', agentId: 'signed', subject: 'agent:signed' },
      functionRef: 'tasks:create',
      operation: 'mutation',
      jti: 'call-1',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    setIdentityForwardingContext(ctx, args, {
      expectedFunctionRef: 'tasks:create',
      now: Date.UTC(2026, 4, 9, 12, 0, 1),
    })

    expect(getIdentityForwarding(ctx)).toEqual({ principalSubject: 'agent:signed' })
    expect(getForwardedCaller<{ kind: 'agent'; subject: string }>(ctx)).toEqual({
      kind: 'agent',
      agentId: 'signed',
      subject: 'agent:signed',
    })
  })

  it('fails closed on invalid signed forwarding envelopes', () => {
    const now = Date.UTC(2026, 4, 9, 12, 0, 0)
    const key = 'trusted-key-with-enough-alpha-entropy'
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = key
    const base = {
      key,
      keyId: 'default',
      iss: 'trellis://server',
      aud: 'trellis://convex',
      jti: 'call-1',
      sub: 'agent:a1',
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
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
        envelope: createIdentityForwardingEnvelope({ ...base, keyId: 'unknown' }),
        message: /unknown-key/,
      },
      {
        label: 'audience',
        envelope: createIdentityForwardingEnvelope({ ...base, aud: 'trellis://other' }),
        message: /audience/,
      },
      {
        label: 'function',
        envelope: createIdentityForwardingEnvelope({ ...base, functionRef: 'tasks:delete' }),
        message: /function-ref/,
      },
      {
        label: 'args',
        envelope: createIdentityForwardingEnvelope(base),
        args: { title: 'Changed' },
        message: /args-hash/,
      },
      {
        label: 'expired',
        envelope: createIdentityForwardingEnvelope({ ...base, ttlMs: 1 }),
        now: now + 30_000,
        message: /expired/,
      },
    ]

    for (const testCase of cases) {
      const ctx: Record<string, unknown> = {}
      expect(
        () =>
          setIdentityForwardingContext(
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
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const args = createIdentityForwardingEnvelopeArgs({
      args: { title: 'Envelope' },
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
      functionRef: 'tasks:create',
      operation: 'mutation',
      jti: 'oversized-call',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    expect(() =>
      setIdentityForwardingContext({}, args, {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
        maxEnvelopeBytes: 64,
      }),
    ).toThrow(/too-large/)
  })

  it('fails closed on signed forwarding replay when confirmation is required', () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const seen = new Set<string>()
    const args = createIdentityForwardingEnvelopeArgs({
      args: { title: 'Envelope' },
      caller: { kind: 'agent', agentId: 'a1', subject: 'agent:a1' },
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

    expect(() => setIdentityForwardingContext({}, args, options)).not.toThrow()
    expect(() => setIdentityForwardingContext({}, args, options)).toThrow(/replayed/)
  })

  it('fails closed when operation preview and execute purposes are used on the wrong path', () => {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'trusted-key-with-enough-alpha-entropy'
    const previewArgs = createIdentityForwardingEnvelopeArgs({
      args: { id: 'project-1' },
      caller: { kind: 'agent', agentId: 'assistant', subject: 'agent:assistant' },
      functionRef: 'projects:previewDelete',
      operation: 'query',
      purpose: 'operation-preview',
      jti: 'preview-call',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })
    const executeArgs = createIdentityForwardingEnvelopeArgs({
      args: { id: 'project-1', _confirmationToken: 'confirmed' },
      caller: { kind: 'agent', agentId: 'assistant', subject: 'agent:assistant' },
      functionRef: 'projects:delete',
      operation: 'mutation',
      purpose: 'operation-execute',
      jti: 'execute-call',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    expect(() =>
      setIdentityForwardingContext({}, executeArgs, {
        expectedFunctionRef: 'projects:delete',
        expectedPurpose: 'operation-preview',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      }),
    ).toThrow(/purpose/)
    expect(() =>
      setIdentityForwardingContext({}, previewArgs, {
        expectedFunctionRef: 'projects:previewDelete',
        expectedPurpose: 'operation-execute',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      }),
    ).toThrow(/purpose/)
  })

  it('accepts an explicit expected key override when process.env is unavailable', () => {
    const ctx: Record<string, unknown> = {}

    const args = createIdentityForwardingEnvelopeArgs({
      args: { title: 'Component' },
      caller: { kind: 'user', userId: 'u_component', subject: 'user:u_component' },
      functionRef: 'tasks:create',
      operation: 'mutation',
      key: 'component-key',
      jti: 'component-call',
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
    })

    setIdentityForwardingContext(ctx, args, {
      expectedKeyOverride: 'component-key',
      expectedFunctionRef: 'tasks:create',
      now: Date.UTC(2026, 4, 9, 12, 0, 1),
    })

    expect(getIdentityForwarding(ctx)).toEqual({ principalSubject: 'user:u_component' })
  })

  it('does not trust a key carried in args unless the runtime explicitly opts into it', () => {
    const ctx: Record<string, unknown> = {}
    const args = { title: 'Forged component call' }
    const callerChosenKey = 'caller-chosen-forwarding-key-with-enough-entropy'
    const envelope = createIdentityForwardingEnvelope({
      key: callerChosenKey,
      keyId: 'default',
      iss: 'trellis://server',
      aud: 'trellis://convex',
      jti: 'forged-key-in-args',
      sub: 'user:u_forged',
      caller: { kind: 'user', userId: 'u_forged', subject: 'user:u_forged' },
      transport: 'bridge',
      purpose: 'mutation',
      functionRef: 'tasks:create',
      args,
      now: Date.UTC(2026, 4, 9, 12, 0, 0),
      ttlMs: 30_000,
    })

    expect(() =>
      setIdentityForwardingContext(
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
    ).toThrow(/Identity forwarding auth is not configured/)
  })

  it('rejects short identity forwarding keys in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'short-prod-key'

    expect(() =>
      createIdentityForwardingEnvelopeArgs({
        args: { title: 'Envelope' },
        caller: { kind: 'user', userId: 'u_prod', subject: 'user:u_prod' },
        functionRef: 'tasks:create',
        operation: 'mutation',
      }),
    ).toThrow(/at least 32 characters/i)
  })

  it('rejects placeholder identity forwarding keys in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = 'replace-me-with-a-long-random-shared-secret'

    expect(() =>
      createIdentityForwardingEnvelopeArgs({
        args: { title: 'Envelope' },
        caller: { kind: 'user', userId: 'u_prod', subject: 'user:u_prod' },
        functionRef: 'tasks:create',
        operation: 'mutation',
      }),
    ).toThrow(/development or placeholder value/i)
  })

  it('rejects forwarded caller reads on untrusted paths', () => {
    expect(() =>
      getForwardedCaller({}, { caller: { kind: 'agent', subject: 'agent:u_1' } }),
    ).toThrow(/only allowed on verified identity forwarding paths/i)
  })

  it('returns forwarded caller and actingFor on verified identity forwarding paths', () => {
    const ctx: Record<string, unknown> = {}

    setIdentityForwardingContext(
      ctx,
      signedArgs({
        caller: { kind: 'agent', subject: 'agent:agent_1' },
        actingFor: { subject: 'user:u_forwarded', reason: 'approved' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(
      getForwardedCaller<{ kind: 'agent'; subject: string }>(ctx, {
        caller: { kind: 'agent', subject: 'agent:agent_1' },
      }),
    ).toEqual({ kind: 'agent', subject: 'agent:agent_1' })
    expect(
      getForwardedActingFor<{ subject: string; reason?: string }>(ctx, {
        actingFor: { subject: 'user:u_forwarded', reason: 'approved' },
      }),
    ).toEqual({ subject: 'user:u_forwarded', reason: 'approved' })
  })

  it('returns stored forwarded identity from context even when resolver args are sanitized', () => {
    const ctx: Record<string, unknown> = {}

    setIdentityForwardingContext(
      ctx,
      signedArgs({
        caller: { kind: 'agent', subject: 'agent:agent_1' },
        actingFor: { subject: 'user:u_forwarded', reason: 'approved' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(getForwardedCaller<{ kind: 'agent'; subject: string }>(ctx)).toEqual({
      kind: 'agent',
      subject: 'agent:agent_1',
    })
    expect(getForwardedActingFor<{ subject: string; reason?: string }>(ctx)).toEqual({
      subject: 'user:u_forwarded',
      reason: 'approved',
    })
  })

  it('returns null when no forwarded actingFor is present', () => {
    const ctx: Record<string, unknown> = {}

    setIdentityForwardingContext(
      ctx,
      signedArgs({
        caller: { kind: 'agent', subject: 'agent:agent_1' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(getForwardedActingFor<{ subject: string }>(ctx)).toBeNull()
  })

  it('rejects mismatched forwarded caller and actingFor payloads', () => {
    const ctx: Record<string, unknown> = {}

    setIdentityForwardingContext(
      ctx,
      signedArgs({
        caller: { kind: 'agent', subject: 'agent:agent_1' },
        actingFor: { subject: 'user:u_forwarded' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(() =>
      getForwardedCaller<{ kind: 'agent'; subject: string }>(
        ctx,
        { appIdentity: { kind: 'agent', subject: 'agent:other' } },
        'appIdentity',
      ),
    ).toThrow(/caller` subject does not match/i)
    expect(() =>
      getForwardedActingFor<{ subject: string }>(
        ctx,
        { target: { subject: 'user:other' } },
        'target',
      ),
    ).toThrow(/actingFor` subject does not match/i)
  })

  it('rejects forwarded principals whose explicit subject conflicts with their id fields', () => {
    const ctx: Record<string, unknown> = {}

    setIdentityForwardingContext(
      ctx,
      signedArgs({
        caller: { kind: 'user', userId: 'attacker', subject: 'user:attacker' },
      }),
      {
        expectedFunctionRef: 'tasks:create',
        now: Date.UTC(2026, 4, 9, 12, 0, 1),
      },
    )

    expect(() =>
      getForwardedCaller<{ kind: 'user'; userId: string; subject: string }>(
        ctx,
        { appIdentity: { kind: 'user', userId: 'victim', subject: 'user:attacker' } },
        'appIdentity',
      ),
    ).toThrow(/canonical subject/i)
  })
})
