import { convexTest } from 'convex-test'
/**
 * Tests for Experiment 10: Envelope callee-binding roundtrip
 */
import { describe, it, expect } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('Experiment 10: Envelope callee-binding', () => {
  it('signs + verifies envelopes with aud and callee', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(internal.expEnvelopeBinding.testValidEnvelope, {})
    expect(result.signed).toBe(true)
    expect(result.verified).toBe(true)
    expect(result.callee).toBe('posts:deletePost')
    expect(result.caller).toEqual({ kind: 'mcp', mcpKeyId: 'k1', userId: 'u1' })
  })

  it('rejects envelope bound to a different callee', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(internal.expEnvelopeBinding.testCalleeMismatch, {})
    expect(result.rejected).toBe(true)
    expect(result.errorMessage).toContain('Callee mismatch')
    expect(result.errorMessage).toContain('posts:deletePost')
    expect(result.errorMessage).toContain('posts:createPost')
  })

  it('rejects envelope with wrong purpose (audience mismatch)', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(internal.expEnvelopeBinding.testPurposeMismatch, {})
    expect(result.rejected).toBe(true)
  })

  it('internal.* refs exist but have no stable public name accessor', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(internal.expEnvelopeBinding.testApiRefToString, {})
    expect(result.hasRef).toBe(true)
    // Confirms the decision to require explicit string calleeStrings —
    // we don't inspect internal properties of the ref object.
  })
})
