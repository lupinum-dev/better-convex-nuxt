/**
 * Tests for Experiment 14: ctx.runAsUser() roundtrip.
 */
import { describe, it, expect } from 'vitest'
import { convexTest } from 'convex-test'
import schema from './schema'
import { internal } from './_generated/api'
import { modules } from './test.setup'

describe('Experiment 14: runAsUser roundtrip', () => {
  it('14a: signed user envelope resolves to user principal with userId', async () => {
    const t = convexTest(schema, modules)
    const result = await t.action(internal.expRunAsUser.testHappyPath, {
      userId: 'user_alice',
    })
    expect(result.principalKind).toBe('user')
    expect(result.userId).toBe('user_alice')
  })

  it('14b: tampered envelope is rejected', async () => {
    const t = convexTest(schema, modules)
    const result = await t.action(internal.expRunAsUser.testTamperedEnvelope, {})
    expect(result.rejected).toBe(true)
  })

  it('14c: envelope bound to different function is rejected', async () => {
    const t = convexTest(schema, modules)
    const result = await t.action(internal.expRunAsUser.testWrongCallee, {})
    expect(result.rejected).toBe(true)
    expect(result.error).toContain('Callee mismatch')
  })

  it('14d: no envelope falls back to systemPrincipal, not the caller', async () => {
    const t = convexTest(schema, modules)
    const result = await t.action(internal.expRunAsUser.testNoEnvelope, {})
    expect(result.principalKind).toBe('service')
    expect(result.service).toBe('system')
  })

  it('14e: service envelope stays a service principal — not silently coerced to user', async () => {
    const t = convexTest(schema, modules)
    const result = await t.action(internal.expRunAsUser.testServiceIsNotUser, {})
    expect(result.principalKind).toBe('service')
    expect(result.service).toBe('cron')
    expect(result.userId).toBeUndefined()
  })
})
