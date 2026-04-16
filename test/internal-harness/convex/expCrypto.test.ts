/**
 * Experiment 1: Crypto in Convex Runtime — Tests
 */
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('Exp 1: Crypto in Convex Runtime', () => {
  it('1a: HKDF key derivation works in edge-runtime', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.expCrypto.testHkdf, {})

    expect(result.success).toBe(true)
    expect(result.keyLength).toBe(32)
    expect(result.keyHex).toHaveLength(64) // 32 bytes = 64 hex chars
  })

  it('1b: jose JWT sign + verify works in edge-runtime', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.expCrypto.testJoseJwt, {})

    expect(result.success).toBe(true)
    expect(result.tokenLength).toBeGreaterThan(0)
    expect(result.audience).toBe('trellis:test:v1')
    expect(result.callee).toBe('posts:deletePost')
  })

  it('1c: Full pipeline — HKDF → sign JWT → verify JWT', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.expCrypto.testFullPipeline, {})

    expect(result.success).toBe(true)
    expect(result.claims.aud).toBe('trellis:mcp-confirmation:v1')
    expect(result.claims.callee).toBe('runbooks:executeDeleteRunbook')
    expect(result.claims.v).toBe(1)
    expect(result.claims.argsHash).toBe('abc123')
    expect(result.claims.previewHash).toBe('def456')
  })

  it('1d: Verification failures — wrong key, wrong audience, expired', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.expCrypto.testVerificationFailures, {})

    expect(result.wrongKeyFails).toBe(true)
    expect(result.wrongAudienceFails).toBe(true)
    expect(result.expiredFails).toBe(true)
  })
})
