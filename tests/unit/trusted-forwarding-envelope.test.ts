import { describe, expect, it } from 'vitest'

import {
  canonicalizeForwardingArgs,
  createTrustedForwardingEnvelope,
  hashForwardingArgs,
  TrustedForwardingEnvelopeError,
  verifyTrustedForwardingEnvelope,
} from '../../src/runtime/trusted-forwarding'
import { defaultTrustedForwardingMaxEnvelopeBytes } from '../../src/runtime/trusted-forwarding/envelope'

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

function decodePart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T
}

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function replaceEnvelopeHeader(envelope: string, patch: Record<string, unknown>): string {
  const [header, payload, signature] = envelope.split('.') as [string, string, string]
  const nextHeader = encodePart({ ...decodePart<Record<string, unknown>>(header), ...patch })
  return `${nextHeader}.${payload}.${signature}`
}

describe('trusted forwarding envelopes', () => {
  it('canonicalizes args deterministically and excludes forwarding metadata', () => {
    expect(
      canonicalizeForwardingArgs({
        z: 1,
        a: { b: true },
        _trellisForwarding: 'ignored',
        _trustedForwardingKey: 'ignored',
        _trustedForwarding: { principalSubject: 'ignored' },
        __trellis: { trace: 'ignored' },
        principal: { subject: 'ignored' },
        delegation: { subject: 'ignored' },
      }),
    ).toBe(
      '{"a":{"b":true},"delegation":{"subject":"ignored"},"principal":{"subject":"ignored"},"z":1}',
    )
    expect(hashForwardingArgs({ b: 2, a: 1 })).toBe(hashForwardingArgs({ a: 1, b: 2 }))
  })

  it('keeps canonical args hash test vectors stable', () => {
    const vectors = [
      {
        args: {
          z: 1,
          a: { b: true },
          _trellisForwarding: 'ignored',
          _trellisForwardingKey: 'ignored',
          _trustedForwardingKey: 'ignored',
          _trustedForwarding: { principalSubject: 'ignored' },
          __trellis: { trace: 'ignored' },
          principal: { subject: 'ignored' },
          delegation: { subject: 'ignored' },
        },
        canonical:
          '{"a":{"b":true},"delegation":{"subject":"ignored"},"principal":{"subject":"ignored"},"z":1}',
        hash: 'iLSkFSs_EoAdiRE7_H-ndlsK9-8RIE6_tdcnvvSPAKM',
      },
      {
        args: {
          z: 1,
          nested: {
            principal: 'business',
            delegation: 'business',
          },
          principal: { subject: 'ignored' },
          delegation: { subject: 'ignored' },
        },
        canonical:
          '{"delegation":{"subject":"ignored"},"nested":{"delegation":"business","principal":"business"},"principal":{"subject":"ignored"},"z":1}',
        hash: 'MPMtWV7R94A-_2iWrr6sIKZdAitV6matgP3ag5F5AH0',
      },
      {
        args: {
          nested: {
            _trellisForwarding: 'business',
            _trustedForwarding: { principalSubject: 'business' },
            _trustedForwardingKey: 'business',
            __trellis: { trace: 'business' },
          },
        },
        canonical:
          '{"nested":{"__trellis":{"trace":"business"},"_trellisForwarding":"business","_trustedForwarding":{"principalSubject":"business"},"_trustedForwardingKey":"business"}}',
        hash: '-0htiQFh9WsLXih-k-lOIaYuUN2EClu5SEDRMzAZkGs',
      },
      {
        args: {
          items: [1, undefined, null, { b: 2, a: 1 }],
          optional: undefined,
        },
        canonical: '{"items":[1,null,null,{"a":1,"b":2}]}',
        hash: 'llnIMe-pmO8r5f4mT1zediumV9Vqfj9QS-QSjJKUB2Q',
      },
      {
        args: {
          id: 'j97f8x2v6k1c9e3w4q5r6t7y8h9m0n1p',
          nested: { beta: 'b', alpha: 'a' },
        },
        canonical: '{"id":"j97f8x2v6k1c9e3w4q5r6t7y8h9m0n1p","nested":{"alpha":"a","beta":"b"}}',
        hash: '0Y9VM_pkQA_MgpEd_79yEjt1iTnJlGcEa24ihRm19eQ',
      },
    ]

    for (const vector of vectors) {
      expect(canonicalizeForwardingArgs(vector.args)).toBe(vector.canonical)
      expect(hashForwardingArgs(vector.args)).toBe(vector.hash)
    }
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
    const envelope = createEnvelope()

    expect(() =>
      verifyTrustedForwardingEnvelope(envelope, {
        keys: {},
        expectedIssuer: 'nuxt://app',
        expectedAudience: 'convex://deployment',
        functionRef: 'features.projects.create',
        args: { title: 'Roadmap' },
        now,
      }),
    ).toThrow(TrustedForwardingEnvelopeError)
    expect(() =>
      verifyTrustedForwardingEnvelope(envelope, {
        keys: {},
        expectedIssuer: 'nuxt://app',
        expectedAudience: 'convex://deployment',
        functionRef: 'features.projects.create',
        args: { title: 'Roadmap' },
        now,
      }),
    ).toThrow(/key id\.$/)
  })

  it('rejects audience, function, args, and expiry drift', () => {
    const envelope = createEnvelope()

    expect(() =>
      verifyTrustedForwardingEnvelope(envelope, {
        keys: { '2026-05-a': key },
        expectedIssuer: 'nuxt://other',
        expectedAudience: 'convex://deployment',
        functionRef: 'features.projects.create',
        args: { title: 'Roadmap' },
        now,
      }),
    ).toThrow(/issuer/)

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
      verify(envelope, {
        title: 'Roadmap',
        principal: { subject: 'user:attacker', kind: 'user' },
      }),
    ).toThrow(/args/)

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

  it('rejects purpose, transport, and max TTL drift', () => {
    const envelope = createEnvelope()
    const longTtlEnvelope = createTrustedForwardingEnvelope({
      key,
      keyId: '2026-05-a',
      iss: 'nuxt://app',
      aud: 'convex://deployment',
      jti: 'call-long',
      sub: 'user:123',
      principal: { subject: 'user:123', kind: 'user' },
      transport: 'mcp',
      purpose: 'mutation',
      functionRef: 'features.projects.create',
      args: { title: 'Roadmap' },
      now,
      ttlMs: 120_000,
    })

    expect(() =>
      verifyTrustedForwardingEnvelope(envelope, {
        keys: { '2026-05-a': key },
        expectedIssuer: 'nuxt://app',
        expectedAudience: 'convex://deployment',
        expectedPurpose: 'query',
        functionRef: 'features.projects.create',
        args: { title: 'Roadmap' },
        now,
      }),
    ).toThrow(/purpose/)

    expect(() =>
      verifyTrustedForwardingEnvelope(envelope, {
        keys: { '2026-05-a': key },
        expectedIssuer: 'nuxt://app',
        expectedAudience: 'convex://deployment',
        expectedTransport: 'server',
        functionRef: 'features.projects.create',
        args: { title: 'Roadmap' },
        now,
      }),
    ).toThrow(/transport/)

    expect(() =>
      verifyTrustedForwardingEnvelope(longTtlEnvelope, {
        keys: { '2026-05-a': key },
        expectedIssuer: 'nuxt://app',
        expectedAudience: 'convex://deployment',
        functionRef: 'features.projects.create',
        args: { title: 'Roadmap' },
        now,
      }),
    ).toThrow(/TTL/)
  })

  it('rejects unsupported algorithms and invalid signatures', () => {
    const envelope = createEnvelope()
    const invalidAlgorithm = replaceEnvelopeHeader(envelope, { alg: 'none' })
    const invalidSignature = `${envelope.slice(0, -1)}x`

    expect(() => verify(invalidAlgorithm)).toThrow(/algorithm/)
    expect(() => verify(invalidSignature)).toThrow(/signature/)
  })

  it('rejects unsupported canonical args values instead of hashing them as null or empty objects', () => {
    expect(() => canonicalizeForwardingArgs({ count: Number.NaN })).toThrow(/number/)
    expect(() => canonicalizeForwardingArgs({ count: -0 })).toThrow(/number/)
    expect(() => canonicalizeForwardingArgs({ count: 1n })).toThrow(/bigint/)
    expect(() => canonicalizeForwardingArgs({ bytes: new Uint8Array([1, 2, 3]) })).toThrow(/binary/)
    expect(() => canonicalizeForwardingArgs({ when: new Date('2026-05-09T00:00:00Z') })).toThrow(
      /object/,
    )
  })

  it('rejects oversized envelopes before payload verification', () => {
    const envelope = createEnvelope({
      title: 'Roadmap',
      filler: 'x'.repeat(defaultTrustedForwardingMaxEnvelopeBytes),
    })

    expect(() =>
      verifyTrustedForwardingEnvelope(envelope, {
        keys: { '2026-05-a': key },
        expectedIssuer: 'nuxt://app',
        expectedAudience: 'convex://deployment',
        functionRef: 'features.projects.create',
        args: { title: 'Roadmap' },
        now,
        maxEnvelopeBytes: 64,
      }),
    ).toThrow(/too large/)
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
