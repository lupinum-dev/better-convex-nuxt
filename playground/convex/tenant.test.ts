/**
 * Tenant Isolation Integration Tests
 *
 * Verifies full database isolation using scopedQuery/scopedMutation
 * with convex-test and real schema.
 */

import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, it, expect } from 'vitest'

import schema from './schema'
import { modules } from './test.setup'

// Module references for tenant-posts (not in generated API yet)
const tenantPosts = anyApi['tenant-posts']

// ============================================================================
// Helpers
// ============================================================================

async function setupTwoOrgs() {
  const t = convexTest(schema, modules)

  const org1Id = await t.run(async (ctx) => {
    return await ctx.db.insert('organizations', {
      name: 'Org 1',
      slug: 'org-1',
      ownerId: 'user_1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  const org2Id = await t.run(async (ctx) => {
    return await ctx.db.insert('organizations', {
      name: 'Org 2',
      slug: 'org-2',
      ownerId: 'user_2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      authId: 'user_1',
      role: 'member',
      organizationId: org1Id,
      displayName: 'User 1',
      email: 'user1@test.com',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.db.insert('users', {
      authId: 'user_2',
      role: 'member',
      organizationId: org2Id,
      displayName: 'User 2',
      email: 'user2@test.com',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })

  return {
    t,
    org1Id,
    org2Id,
    asUser1: t.withIdentity({ subject: 'user_1' }),
    asUser2: t.withIdentity({ subject: 'user_2' }),
  }
}

async function setupMultipleRoles() {
  const t = convexTest(schema, modules)

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
    for (const [authId, role] of [
      ['user_owner', 'owner'],
      ['user_admin', 'admin'],
      ['user_member', 'member'],
      ['user_viewer', 'viewer'],
    ] as const) {
      await ctx.db.insert('users', {
        authId,
        role,
        organizationId: orgId,
        displayName: `${role} user`,
        email: `${role}@test.com`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
  })

  return {
    t,
    orgId,
    asOwner: t.withIdentity({ subject: 'user_owner' }),
    asAdmin: t.withIdentity({ subject: 'user_admin' }),
    asMember: t.withIdentity({ subject: 'user_member' }),
    asViewer: t.withIdentity({ subject: 'user_viewer' }),
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('tenant isolation', () => {
  describe('scopedQuery — org filtering', () => {
    it('only returns posts from the user\'s org', async () => {
      const { asUser1, asUser2 } = await setupTwoOrgs()

      await asUser1.mutation(tenantPosts.create, {
        title: 'Org1 Post',
        content: 'Content 1',
      })
      await asUser2.mutation(tenantPosts.create, {
        title: 'Org2 Post',
        content: 'Content 2',
      })

      const org1Posts = await asUser1.query(tenantPosts.list, {})
      expect(org1Posts).toHaveLength(1)
      expect(org1Posts[0].title).toBe('Org1 Post')

      const org2Posts = await asUser2.query(tenantPosts.list, {})
      expect(org2Posts).toHaveLength(1)
      expect(org2Posts[0].title).toBe('Org2 Post')
    })

    it('returns empty array for unauthenticated users', async () => {
      const { t, asUser1 } = await setupTwoOrgs()

      await asUser1.mutation(tenantPosts.create, {
        title: 'Test Post',
        content: 'Content',
      })

      const posts = await t.query(tenantPosts.list, {})
      expect(posts).toEqual([])
    })
  })

  describe('scoped get', () => {
    it('returns null for documents from other orgs', async () => {
      const { asUser1, asUser2 } = await setupTwoOrgs()

      const postId = await asUser1.mutation(tenantPosts.create, {
        title: 'Org1 Only',
        content: 'Secret',
      })

      const visible = await asUser1.query(tenantPosts.get, { id: postId })
      expect(visible).not.toBeNull()
      expect(visible?.title).toBe('Org1 Only')

      const hidden = await asUser2.query(tenantPosts.get, { id: postId })
      expect(hidden).toBeNull()
    })
  })

  describe('scoped insert', () => {
    it('auto-injects organizationId on insert', async () => {
      const { asUser1, org1Id } = await setupTwoOrgs()

      const postId = await asUser1.mutation(tenantPosts.create, {
        title: 'Auto-Scoped',
        content: 'Content',
      })

      const post = await asUser1.query(tenantPosts.get, { id: postId })
      expect(post?.organizationId).toBe(org1Id)
    })
  })

  describe('scoped mutation — cross-org prevention', () => {
    it('prevents updating documents from other orgs', async () => {
      const { asUser1, asUser2 } = await setupTwoOrgs()

      const postId = await asUser1.mutation(tenantPosts.create, {
        title: 'Org1 Post',
        content: 'Content',
      })

      await expect(
        asUser2.mutation(tenantPosts.update, { id: postId, title: 'Hacked' }),
      ).rejects.toThrow()
    })

    it('prevents deleting documents from other orgs', async () => {
      const { asUser1, asUser2 } = await setupTwoOrgs()

      const postId = await asUser1.mutation(tenantPosts.create, {
        title: 'Org1 Post',
        content: 'Content',
      })

      await expect(
        asUser2.mutation(tenantPosts.remove, { id: postId }),
      ).rejects.toThrow()
    })
  })

  describe('authentication', () => {
    it('throws for unauthenticated mutations', async () => {
      const { t } = await setupTwoOrgs()

      await expect(
        t.mutation(tenantPosts.create, { title: 'Test', content: 'Content' }),
      ).rejects.toThrow('Authentication required')
    })
  })

  describe('permissions', () => {
    it('denies viewers from creating posts', async () => {
      const { asViewer } = await setupMultipleRoles()

      await expect(
        asViewer.mutation(tenantPosts.create, { title: 'Test', content: 'Content' }),
      ).rejects.toThrow('Permission denied')
    })

    it('allows members to create posts', async () => {
      const { asMember } = await setupMultipleRoles()

      const postId = await asMember.mutation(tenantPosts.create, {
        title: 'Member Post',
        content: 'Content',
      })

      expect(postId).toBeDefined()
    })
  })

  describe('escape hatch', () => {
    it('tenant.raw.db bypasses scoping', async () => {
      const { asUser1, asUser2 } = await setupTwoOrgs()

      await asUser1.mutation(tenantPosts.create, { title: 'A', content: 'a' })
      await asUser2.mutation(tenantPosts.create, { title: 'B', content: 'b' })

      // rawCount uses tenant.raw.db to see ALL posts
      const total = await asUser1.query(tenantPosts.rawCount, {})
      expect(total).toBe(2)
    })
  })
})
