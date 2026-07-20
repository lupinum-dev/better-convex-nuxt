import type { Value } from 'convex/values'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  CanonicalConvexValueError,
  canonicalConvexJson,
  digestConvexValue,
} from '../../internal/labs/mcp-topology/nitro/exact-call/canonical-convex'
import {
  ServiceCallProofError,
  signServiceCallProof,
  verifyServiceCallProof,
  type ServiceCallProofV1,
  type VerifyServiceCallOptions,
} from '../../internal/labs/mcp-topology/nitro/exact-call/service-call-proof'

const NOW = 1_800_000_000
const ISSUER = 'better-convex-nitro-lab'
const AUDIENCE = 'convex-lab-deployment'
const SERVICE_ID = 'nitro-mcp-gateway'
const KEY_ID = 'active-2026-07'
const MCP_ISSUER = 'https://auth.example.test/'
const MCP_RESOURCE = 'https://app.example.test/mcp'
const FUNCTION_NAME = 'application:searchNotes'
const ARGS = { query: 'alpha', workspaceId: 'workspace-a' }

let activePrivateKey: CryptoKey
let activePublicKey: CryptoKey
let retainedPrivateKey: CryptoKey
let retainedPublicKey: CryptoKey

function encodedJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

async function signRaw(
  payload: unknown,
  privateKey = activePrivateKey,
  header: Record<string, unknown> = {
    alg: 'EdDSA',
    kid: KEY_ID,
    typ: 'bcn-service-call+jws',
  },
): Promise<string> {
  const input = `${encodedJson(header)}.${encodedJson(payload)}`
  const signature = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(input))
  return `${input}.${Buffer.from(signature).toString('base64url')}`
}

async function claims(
  overrides: Partial<Omit<ServiceCallProofV1, 'mcp'>> & {
    mcp?: Partial<ServiceCallProofV1['mcp']>
  } = {},
): Promise<ServiceCallProofV1> {
  return {
    argsDigest: await digestConvexValue(ARGS),
    audience: AUDIENCE,
    callId: 'call_abcdefghijklmnop',
    expiresAt: NOW + 15,
    functionName: FUNCTION_NAME,
    issuedAt: NOW,
    issuer: ISSUER,
    keyId: KEY_ID,
    operation: 'query',
    serviceId: SERVICE_ID,
    version: 1,
    ...overrides,
    mcp: {
      authorizationReference: { id: 'consent-alice', kind: 'oauth-consent' },
      clientId: 'client-a',
      issuer: MCP_ISSUER,
      resource: MCP_RESOURCE,
      scopes: ['notes:read', 'notes:write'],
      subject: 'alice',
      ...overrides.mcp,
    },
  }
}

function verification(overrides: Partial<VerifyServiceCallOptions> = {}): VerifyServiceCallOptions {
  return {
    args: ARGS,
    audience: AUDIENCE,
    functionName: FUNCTION_NAME,
    issuer: ISSUER,
    mcpIssuer: MCP_ISSUER,
    mcpResource: MCP_RESOURCE,
    nowSeconds: NOW,
    operation: 'query',
    publicKeys: { [KEY_ID]: activePublicKey, 'retained-2026-06': retainedPublicKey },
    requiredScope: 'notes:read',
    serviceId: SERVICE_ID,
    ...overrides,
  }
}

beforeAll(async () => {
  const active = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  activePrivateKey = active.privateKey
  activePublicKey = active.publicKey
  const retained = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  retainedPrivateKey = retained.privateKey
  retainedPublicKey = retained.publicKey
})

describe('vNext exact-call canonical Convex encoding', () => {
  const bytes = new Uint8Array([0, 1, 254, 255]).buffer
  const vectors: Array<[string, Value, string]> = [
    ['null', null, 'null'],
    ['boolean', true, 'true'],
    ['ordinary number', 42.5, '42.5'],
    ['positive zero', 0, '0'],
    ['negative zero', -0, '{"$float":"AAAAAAAAAIA="}'],
    ['NaN', Number.NaN, '{"$float":"AAAAAAAA+H8="}'],
    ['positive infinity', Number.POSITIVE_INFINITY, '{"$float":"AAAAAAAA8H8="}'],
    ['negative infinity', Number.NEGATIVE_INFINITY, '{"$float":"AAAAAAAA8P8="}'],
    ['int64', 1_234_567_890_123_456_789n, '{"$integer":"FYHpffQQIhE="}'],
    ['minimum int64', -(2n ** 63n), '{"$integer":"AAAAAAAAAIA="}'],
    ['maximum int64', 2n ** 63n - 1n, '{"$integer":"/////////38="}'],
    ['UTF-8 string', 'héllo 😀', '"héllo 😀"'],
    ['bytes', bytes, '{"$bytes":"AAH+/w=="}'],
    [
      'array',
      [1, 'x', false, 3n, bytes],
      '[1,"x",false,{"$integer":"AwAAAAAAAAA="},{"$bytes":"AAH+/w=="}]',
    ],
    [
      'recursively sorted object',
      { list: [{ b: 2, a: 1 }], z: 1, a: { y: 2, x: 3 } },
      '{"a":{"x":3,"y":2},"list":[{"a":1,"b":2}],"z":1}',
    ],
  ]

  it.each(vectors)('matches the pinned Convex wire form for %s', (_name, value, expected) => {
    expect(canonicalConvexJson(value)).toBe(expected)
  })

  it('treats object order and omitted undefined fields exactly like the Convex client', async () => {
    const left = { b: 2, nested: { z: 3, a: 1 } }
    const right = { nested: { a: 1, z: 3 }, ignored: undefined, b: 2 } as unknown as Value
    expect(canonicalConvexJson(left)).toBe(canonicalConvexJson(right))
    await expect(digestConvexValue(left)).resolves.toBe(await digestConvexValue(right))
  })

  it.each([
    undefined,
    new Date('2026-01-01T00:00:00Z'),
    new Map([['secret-argument', 1]]),
    new Set(['secret-argument']),
    new Uint8Array([1, 2, 3]),
    2n ** 63n,
  ])(
    'rejects unsupported values without reproducing the Convex value diagnostic',
    async (value) => {
      let error: unknown
      try {
        await digestConvexValue(value as Value)
      } catch (caught) {
        error = caught
      }
      expect(error).toBeInstanceOf(CanonicalConvexValueError)
      expect(JSON.stringify(error)).not.toContain('secret-argument')
      expect(String(error)).not.toContain('secret-argument')
    },
  )
})

describe('vNext Ed25519 exact-call proof', () => {
  it('verifies a strictly bound proof and returns no private authorization reference', async () => {
    const proof = await signServiceCallProof(await claims(), activePrivateKey)
    const verified = await verifyServiceCallProof(proof, verification())
    expect(verified).toEqual({
      callId: 'call_abcdefghijklmnop',
      mcp: {
        clientId: 'client-a',
        issuer: MCP_ISSUER,
        resource: MCP_RESOURCE,
        scopes: ['notes:read', 'notes:write'],
        subject: 'alice',
      },
      serviceId: SERVICE_ID,
    })
    expect(JSON.stringify(verified)).not.toContain('consent-alice')
    expect(JSON.stringify(verified)).not.toContain(proof)
  })

  it('accepts a configured retained verification key without accepting an absent retired key', async () => {
    const retainedClaims = await claims({ keyId: 'retained-2026-06' })
    const retained = await signServiceCallProof(retainedClaims, retainedPrivateKey)
    await expect(verifyServiceCallProof(retained, verification())).resolves.toMatchObject({
      callId: retainedClaims.callId,
    })

    const retiredClaims = await claims({ keyId: 'retired-2026-05' })
    const retired = await signServiceCallProof(retiredClaims, retainedPrivateKey)
    await expect(verifyServiceCallProof(retired, verification())).rejects.toBeInstanceOf(
      ServiceCallProofError,
    )
  })

  it.each([
    ['issuer', { issuer: `${ISSUER}-other` }],
    ['audience', { audience: `${AUDIENCE}-other` }],
    ['service', { serviceId: `${SERVICE_ID}-other` }],
    ['operation', { operation: 'mutation' as const }],
    ['function', { functionName: 'application:renameNote' }],
  ])('rejects %s substitution', async (_name, override) => {
    const proof = await signServiceCallProof(await claims(override), activePrivateKey)
    await expect(verifyServiceCallProof(proof, verification())).rejects.toBeInstanceOf(
      ServiceCallProofError,
    )
  })

  it('rejects argument mutation after signing', async () => {
    const mutable = { query: 'alpha', workspaceId: 'workspace-a' }
    const proof = await signServiceCallProof(
      await claims({ argsDigest: await digestConvexValue(mutable) }),
      activePrivateKey,
    )
    mutable.query = 'beta'
    await expect(
      verifyServiceCallProof(proof, verification({ args: mutable })),
    ).rejects.toBeInstanceOf(ServiceCallProofError)
  })

  it.each([
    ['expired', { expiresAt: NOW }],
    ['future', { issuedAt: NOW + 1, expiresAt: NOW + 2 }],
    ['non-positive lifetime', { expiresAt: NOW }],
    ['overlong lifetime', { expiresAt: NOW + 16 }],
  ])('rejects %s time claims', async (_name, override) => {
    const proof = await signServiceCallProof(await claims(override), activePrivateKey)
    await expect(verifyServiceCallProof(proof, verification())).rejects.toBeInstanceOf(
      ServiceCallProofError,
    )
  })

  it('rejects delegated issuer, resource, and scope substitution', async () => {
    for (const mcp of [
      { issuer: 'https://other.example.test/' },
      { resource: 'https://other.example.test/mcp' },
      { scopes: ['notes:other'] },
    ]) {
      const proof = await signServiceCallProof(await claims({ mcp }), activePrivateKey)
      await expect(verifyServiceCallProof(proof, verification())).rejects.toBeInstanceOf(
        ServiceCallProofError,
      )
    }
  })

  it('rejects algorithm confusion and unknown header, claim, nested, and reference fields', async () => {
    const valid = await claims()
    const candidates = [
      await signRaw(valid, activePrivateKey, {
        alg: 'HS256',
        kid: KEY_ID,
        typ: 'bcn-service-call+jws',
      }),
      await signRaw(valid, activePrivateKey, {
        alg: 'EdDSA',
        extra: true,
        kid: KEY_ID,
        typ: 'bcn-service-call+jws',
      }),
      await signRaw({ ...valid, extra: true }),
      await signRaw({ ...valid, mcp: { ...valid.mcp, extra: true } }),
      await signRaw({
        ...valid,
        mcp: {
          ...valid.mcp,
          authorizationReference: { ...valid.mcp.authorizationReference, extra: true },
        },
      }),
    ]
    for (const candidate of candidates) {
      await expect(verifyServiceCallProof(candidate, verification())).rejects.toBeInstanceOf(
        ServiceCallProofError,
      )
    }
  })

  it('rejects malformed compact input with one coarse, non-reflective error', async () => {
    for (const proof of ['', 'not-a-proof', 'e31.e30.e30', 'secret-argument...']) {
      let error: unknown
      try {
        await verifyServiceCallProof(proof, verification())
      } catch (caught) {
        error = caught
      }
      expect(error).toBeInstanceOf(ServiceCallProofError)
      if (proof) {
        expect(String(error)).not.toContain(proof)
        expect(JSON.stringify(error)).not.toContain(proof)
      }
    }
  })
})
