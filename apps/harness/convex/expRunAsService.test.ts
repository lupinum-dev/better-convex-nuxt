import { convexTest } from 'convex-test'
/**
 * Tests for Experiment 11: ctx.runAsService() roundtrip
 */
import { describe, it, expect } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('Experiment 11: runAsService roundtrip', () => {
  it('11a: signed service envelope resolves to service caller', async () => {
    const t = convexTest(schema, modules)
    const result = await t.action(internal.expRunAsService.testHappyPath, {})
    expect(result.principalKind).toBe('service')
    expect(result.service).toBe('stripe-webhook')
    expect(result.envelopeLength).toBeGreaterThan(50) // sanity: real JWT
  })

  it('11b: tampered envelope is rejected', async () => {
    const t = convexTest(schema, modules)
    const result = await t.action(internal.expRunAsService.testTamperedEnvelope, {})
    expect(result.rejected).toBe(true)
  })

  it('11c: envelope bound to different function is rejected', async () => {
    const t = convexTest(schema, modules)
    const result = await t.action(internal.expRunAsService.testWrongCallee, {})
    expect(result.rejected).toBe(true)
    expect(result.error).toContain('Callee mismatch')
  })

  it('11d: no envelope falls back to systemCaller default', async () => {
    const t = convexTest(schema, modules)
    const result = await t.action(internal.expRunAsService.testNoEnvelope, {})
    expect(result.principalKind).toBe('service')
    expect(result.service).toBe('system')
  })
})
