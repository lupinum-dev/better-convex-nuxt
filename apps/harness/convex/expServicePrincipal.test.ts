/**
 * Experiment 6: Service Caller Structural Detection — Tests
 *
 * Proves the builder type (public vs internal) determines how no-auth
 * resolves — this is structural, not a runtime heuristic.
 */
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('Exp 6: Service Caller Structural Detection', () => {
  // ---- Public query ----

  it('6a: public query, no auth → anonymous', async () => {
    const t = convexTest(schema, modules)

    const result = await t.query(api.expServicePrincipal.getPublicPrincipal, {})

    expect(result.kind).toBe('anonymous')
  })

  it('6b: public query, with auth → user', async () => {
    const t = convexTest(schema, modules)

    const result = await t
      .withIdentity({ subject: 'user_1', tokenIdentifier: 'user_1' })
      .query(api.expServicePrincipal.getPublicPrincipal, {})

    expect(result.kind).toBe('user')
  })

  // ---- Internal query ----

  it('6c: internal query, no auth → system', async () => {
    const t = convexTest(schema, modules)

    const result = await t.query(internal.expServicePrincipal.getInternalPrincipal, {})

    expect(result.kind).toBe('system')
  })

  it('6d: internal query, with auth → user', async () => {
    const t = convexTest(schema, modules)

    const result = await t
      .withIdentity({ subject: 'user_1', tokenIdentifier: 'user_1' })
      .query(internal.expServicePrincipal.getInternalPrincipal, {})

    expect(result.kind).toBe('user')
  })

  // ---- Public mutation ----

  it('6e: public mutation, no auth → anonymous', async () => {
    const t = convexTest(schema, modules)

    const result = await t.mutation(api.expServicePrincipal.getPublicMutationPrincipal, {})

    expect(result.kind).toBe('anonymous')
  })

  // ---- Internal mutation ----

  it('6f: internal mutation, no auth → system', async () => {
    const t = convexTest(schema, modules)

    const result = await t.mutation(internal.expServicePrincipal.getInternalMutationPrincipal, {})

    expect(result.kind).toBe('system')
  })
})
