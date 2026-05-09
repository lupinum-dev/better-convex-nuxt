import { describe, expect, it } from 'vitest'

import {
  canonicalizeForwardingArgs,
  createTrustedForwardingEnvelope,
  hashForwardingArgs,
  TrustedForwardingEnvelopeError,
  verifyTrustedForwardingEnvelope,
} from '../../src/runtime/trusted-forwarding'

const now = Date.UTC(2026, 4, 9, 12, 0, 0)
const key = 'phase-0-forwarding-key-with-enough-entropy'

function createEnvelope(args: unknown = { title: 'Roadmap' }) {
  return createTrustedForwardingEnvelope({
    key,
    keyId: '2026-05-a',
    iss: 'nuxt://app',
    aud: 'convex://deployment',
    jti: 'call-1',
    sub: 'user:123',
    principal: { subject: 'user:123', kind: 'user' },
    transport: 'mcp',
    purpose: 'mutation',
    functionRef: 'features.projects.create',
    args,
    now,
    ttlMs: 30_000,
  })
}

function verify(envelope: string, args: unknown = { title: 'Roadmap' }) {
  return verifyTrustedForwardingEnvelope(envelope, {
    keys: { '2026-05-a': key },
    expectedIssuer: 'nuxt://app',
    expectedAudience: 'convex://deployment',
    functionRef: 'features.projects.create',
    args,
    now: now + 1_000,
  })
}

describe('trusted forwarding envelopes', () => {
  it('canonicalizes args deterministically and excludes forwarding metadata', () => {
    expect(
      canonicalizeForwardingArgs({
        z: 1,
        a: { b: true },
        _trellisForwarding: 'ignored',
        __trellis: { trace: 'ignored' },
      }),
    ).toBe('{"a":{"b":true},"z":1}')
    expect(hashForwardingArgs({ b: 2, a: 1 })).toBe(hashForwardingArgs({ a: 1, b: 2 }))
  })

  it('signs and verifies a compact forwarding envelope', () => {
    const envelope = createEnvelope()
    const payload = verify(envelope)

    expect(payload).toMatchObject({
      v: 1,
      kid: '2026-05-a',
      iss: 'nuxt://app',
      aud: 'convex://deployment',
      sub: 'user:123',
      functionRef: 'features.projects.create',
      purpose: 'mutation',
      transport: 'mcp',
    })
  })

  it('rejects unknown key ids', () => {
    expect(() =>
      verifyTrustedForwardingEnvelope(createEnvelope(), {
        keys: {},
        expectedIssuer: 'nuxt://app',
        expectedAudience: 'convex://deployment',
        functionRef: 'features.projects.create',
        args: { title: 'Roadmap' },
        now,
      }),
    ).toThrow(TrustedForwardingEnvelopeError)
  })

  it('rejects audience, function, args, and expiry drift', () => {
    const envelope = createEnvelope()

    expect(() =>
      verifyTrustedForwardingEnvelope(envelope, {
        keys: { '2026-05-a': key },
        expectedIssuer: 'nuxt://app',
        expectedAudience: 'convex://other',
        functionRef: 'features.projects.create',
        args: { title: 'Roadmap' },
        now,
      }),
    ).toThrow(/audience/)

    expect(() =>
      verifyTrustedForwardingEnvelope(envelope, {
        keys: { '2026-05-a': key },
        expectedIssuer: 'nuxt://app',
        expectedAudience: 'convex://deployment',
        functionRef: 'features.projects.delete',
        args: { title: 'Roadmap' },
        now,
      }),
    ).toThrow(/function ref/)

    expect(() => verify(envelope, { title: 'Changed' })).toThrow(/args/)

    expect(() =>
      verifyTrustedForwardingEnvelope(envelope, {
        keys: { '2026-05-a': key },
        expectedIssuer: 'nuxt://app',
        expectedAudience: 'convex://deployment',
        functionRef: 'features.projects.create',
        args: { title: 'Roadmap' },
        now: now + 60_000,
      }),
    ).toThrow(/expired/)
  })

  it('supports replay redemption checks', () => {
    const seen = new Set<string>()
    const envelope = createEnvelope()
    const options = {
      keys: { '2026-05-a': key },
      expectedIssuer: 'nuxt://app',
      expectedAudience: 'convex://deployment',
      functionRef: 'features.projects.create',
      args: { title: 'Roadmap' },
      now,
      redeemJti: (jti: string) => {
        if (seen.has(jti)) return false
        seen.add(jti)
        return true
      },
    }

    expect(() => verifyTrustedForwardingEnvelope(envelope, options)).not.toThrow()
    expect(() => verifyTrustedForwardingEnvelope(envelope, options)).toThrow(/replay/)
  })
})
