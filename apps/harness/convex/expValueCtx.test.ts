/**
 * Experiment 3: Value-Based ctx + Raw DB Resolution — Tests
 */
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('Exp 3: Value-Based ctx + Raw DB Resolution', () => {
  async function setupOrgWithUser(t: ReturnType<typeof convexTest>) {
    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Test Org',
        slug: 'test-org',
        ownerId: 'user_owner',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        authKey: 'user_owner',
        role: 'admin',
        organizationId: orgId,
        displayName: 'Owner',
        email: 'owner@test.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    return { orgId }
  }

  it('3a: caller and appIdentity appear as plain values on ctx', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await setupOrgWithUser(t)

    const result = await t
      .withIdentity({ subject: 'user_owner', tokenIdentifier: 'user_owner' })
      .query(api.expValueCtx.getPrincipalAndActor, {})

    expect(result.principalIsValue).toBe(true)
    expect(result.actorIsValue).toBe(true)
    expect(result.principalKind).toBe('user')
    expect(result.actorUserId).toBe('user_owner')
    expect(result.appIdentityWorkspaceId).toBe(orgId)
    expect(result.actorRole).toBe('admin')
  })

  it('3b: RLS-wrapped db filters posts by tenant', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await setupOrgWithUser(t)

    // Create a second org with posts
    const org2Id = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Other Org',
        slug: 'other-org',
        ownerId: 'user_other',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    // Seed posts in both orgs
    await t.run(async (ctx) => {
      await ctx.db.insert('posts', {
        title: 'My Org Post',
        content: 'a',
        status: 'published',
        ownerId: 'user_owner',
        organizationId: orgId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await ctx.db.insert('posts', {
        title: 'Other Org Post',
        content: 'b',
        status: 'published',
        ownerId: 'user_other',
        organizationId: org2Id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const result = await t
      .withIdentity({ subject: 'user_owner', tokenIdentifier: 'user_owner' })
      .query(api.expValueCtx.getMyPosts, {})

    // RLS should filter to only the user's org posts
    expect(result.count).toBe(1)
    expect(result.titles).toContain('My Org Post')
    expect(result.titles).not.toContain('Other Org Post')
    expect(result.appIdentityWorkspaceId).toBe(orgId)
  })

  it('3c: public query — anonymous gets null appIdentity', async () => {
    const t = convexTest(schema, modules)

    // No identity — anonymous access
    const result = await t.query(api.expValueCtx.getPublicInfo, {})

    expect(result.principalKind).toBe('anonymous')
    expect(result.actorIsNull).toBe(true)
  })

  it('3d: required-appIdentity query throws without auth', async () => {
    const t = convexTest(schema, modules)

    await expect(t.query(api.expValueCtx.requiresAuth, {})).rejects.toThrow(
      'Unauthorized: appIdentity required',
    )
  })

  it('3e: mutation with appIdentity writes via RLS-wrapped db', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await setupOrgWithUser(t)

    const result = await t
      .withIdentity({ subject: 'user_owner', tokenIdentifier: 'user_owner' })
      .mutation(api.expValueCtx.createPostViaMutation, { title: 'Test Post' })

    expect(result.id).toBeTruthy()
    expect(result.actorRole).toBe('admin')

    // Verify the post was actually created
    const posts = await t.run(async (ctx) => {
      return await ctx.db.query('posts').collect()
    })
    const created = posts.find((p) => p.title === 'Test Post')
    expect(created).toBeTruthy()
    expect(created!.organizationId).toBe(orgId)
  })
})
