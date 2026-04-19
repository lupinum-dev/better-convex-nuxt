import { convexTest } from 'convex-test'
/**
 * Tests for Experiment 12: __workspaceId injection via customQuery input
 */
import { describe, it, expect } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('Experiment 12: __workspaceId injection', () => {
  async function seedUserInOrg(
    t: ReturnType<typeof convexTest>,
    authId: string,
  ): Promise<{ orgId: string }> {
    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Acme',
        slug: 'acme',
        ownerId: authId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        authId,
        role: 'admin',
        organizationId: orgId,
        displayName: 'A',
        email: 'a@t.co',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    return { orgId }
  }

  it('12a: __workspaceId is consumed by input, NOT forwarded to handler', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedUserInOrg(t, 'user_a')

    const result = await t
      .withIdentity({ subject: 'user_a' })
      .query(api.expWorkspaceInject.whoAmIAt, {
        __workspaceId: orgId,
        probe: 'hello',
      })

    // Handler received only the handler-level args
    expect(result.handlerArgsKeys).toEqual(['probe'])
    expect(result.handlerArgsKeys).not.toContain('__workspaceId')
    // Input step saw the __workspaceId
    expect(result.resolvedWorkspaceIdFromInput).toBe(orgId)
  })

  it('12b: resolver scopes actor to the provided workspaceId', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedUserInOrg(t, 'user_b')

    const result = await t
      .withIdentity({ subject: 'user_b' })
      .query(api.expWorkspaceInject.whoAmIAt, { __workspaceId: orgId })

    expect(result.actorWorkspace).toBe(orgId)
    expect(result.role).toBe('admin')
  })

  it('12c: omitting __workspaceId resolves to default (first membership)', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedUserInOrg(t, 'user_c')

    const result = await t
      .withIdentity({ subject: 'user_c' })
      .query(api.expWorkspaceInject.whoAmIAt, {})

    expect(result.actorWorkspace).toBe(orgId)
    expect(result.resolvedWorkspaceIdFromInput).toBeNull()
  })

  it('12d: mismatched workspace → actor null', async () => {
    const t = convexTest(schema, modules)
    await seedUserInOrg(t, 'user_d')

    // Pass some other orgId the user doesn't belong to
    const otherOrgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other',
        slug: 'other',
        ownerId: 'someone_else',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const result = await t
      .withIdentity({ subject: 'user_d' })
      .query(api.expWorkspaceInject.whoAmIAt, { __workspaceId: otherOrgId })

    expect(result.actorWorkspace).toBeNull()
    expect(result.role).toBeUndefined()
  })
})
