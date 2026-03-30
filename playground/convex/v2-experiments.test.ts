import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

function asActor(input: {
  role: 'owner' | 'admin' | 'member' | 'viewer'
  userId: string
  orgId?: string
}) {
  return {
    _serviceKey: 'test-service-key',
    _serviceActor: input,
  }
}

async function seedOrg(t: ReturnType<typeof convexTest>, name: string, slug: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('organizations', {
      name,
      slug,
      ownerId: `${slug}_owner`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })
}

async function seedPost(
  t: ReturnType<typeof convexTest>,
  input: {
    orgId: Id<'organizations'>
    ownerId: string
    title: string
    status?: 'draft' | 'published' | 'archived'
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('posts', {
      title: input.title,
      content: `${input.title} content`,
      status: input.status ?? 'draft',
      ownerId: input.ownerId,
      organizationId: input.orgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })
}

describe('v2 experiment: scoped builders', () => {
  it('supports public, authed, and scoped builders with hidden service auth plumbing', async () => {
    const t = convexTest(schema, modules)
    const { anyApi } = await import('convex/server')
    const api = anyApi['experiments/v2_functions']

    await t.run(async (ctx) => {
      await ctx.db.insert('notes', {
        title: 'Public note',
        content: 'Visible to everyone',
        createdAt: Date.now(),
      })
      await ctx.db.insert('tasks', {
        userId: 'member_1',
        title: 'Mine',
        completed: false,
        createdAt: Date.now(),
      })
      await ctx.db.insert('tasks', {
        userId: 'member_2',
        title: 'Not mine',
        completed: false,
        createdAt: Date.now(),
      })
    })

    const orgId = await seedOrg(t, 'Acme', 'acme')
    const createdId = await t.mutation(api.createPost, {
      title: 'Scoped post',
      content: 'hello',
      ...asActor({ role: 'member', userId: 'member_1', orgId }),
    })

    const [notes, tasks, posts, storedPost] = await Promise.all([
      t.query(api.listNotes, {}),
      t.query(api.listMyTasks, asActor({ role: 'member', userId: 'member_1', orgId })),
      t.query(api.listPosts, asActor({ role: 'member', userId: 'member_1', orgId })),
      t.run(async (ctx) => await ctx.db.get(createdId)),
    ])

    expect(notes).toHaveLength(1)
    expect(tasks.map((task) => task.title)).toEqual(['Mine'])
    expect(posts).toHaveLength(1)
    expect(posts[0]!.title).toBe('Scoped post')
    expect(storedPost!.organizationId).toBe(orgId)
    expect('_serviceKey' in storedPost!).toBe(false)
    expect('_serviceActor' in storedPost!).toBe(false)
  })

  it('keeps scoped db as the default and raw ctx as the explicit escape hatch', async () => {
    const t = convexTest(schema, modules)
    const { anyApi } = await import('convex/server')
    const countPostsWithRaw = anyApi['experiments/v2_functions'].countPostsWithRaw

    const orgA = await seedOrg(t, 'Org A', 'org-a')
    const orgB = await seedOrg(t, 'Org B', 'org-b')
    await seedPost(t, { orgId: orgA, ownerId: 'user_1', title: 'A-1' })
    await seedPost(t, { orgId: orgB, ownerId: 'user_2', title: 'B-1' })

    const counts = await t.query(
      countPostsWithRaw,
      asActor({ role: 'admin', userId: 'user_1', orgId: orgA }),
    )

    expect(counts).toEqual({
      scopedCount: 1,
      rawCount: 2,
    })
  })
})

describe('v2 experiment: query chain fidelity', () => {
  async function seedPosts(t: ReturnType<typeof convexTest>) {
    const orgId = await seedOrg(t, 'Query Org', 'query-org')
    const otherOrgId = await seedOrg(t, 'Other Query Org', 'query-other-org')

    await t.run(async (ctx) => {
      for (let index = 0; index < 10; index++) {
        await ctx.db.insert('posts', {
          title: `Post ${index}`,
          content: `Content ${index}`,
          status: index % 2 === 0 ? 'published' : 'draft',
          ownerId: 'user_1',
          organizationId: orgId,
          createdAt: Date.now() + index,
          updatedAt: Date.now() + index,
        })
      }

      for (let index = 0; index < 5; index++) {
        await ctx.db.insert('posts', {
          title: `Other ${index}`,
          content: `Other ${index}`,
          status: 'published',
          ownerId: 'user_2',
          organizationId: otherOrgId,
          createdAt: Date.now() + index,
          updatedAt: Date.now() + index,
        })
      }
    })

    return { orgId, otherOrgId }
  }

  it('withIndex composes with collect, order, filter, take, first, and paginate', async () => {
    const t = convexTest(schema, modules)
    const { orgId } = await seedPosts(t)

    const result = await t.run(async (ctx) => {
      const byOrg = () =>
        ctx.db.query('posts').withIndex('by_organization', (q) => q.eq('organizationId', orgId))

      const collected = await byOrg().collect()
      const ordered = await byOrg().order('desc').collect()
      const filtered = await byOrg()
        .filter((q) => q.eq(q.field('status'), 'published'))
        .collect()
      const taken = await byOrg()
        .order('desc')
        .filter((q) => q.eq(q.field('status'), 'draft'))
        .take(2)
      const first = await byOrg().first()
      const paged = await byOrg().paginate({ numItems: 4, cursor: null })

      return { collected, ordered, filtered, taken, first, paged }
    })

    expect(result.collected).toHaveLength(10)
    expect(result.collected.every((post) => post.organizationId === orgId)).toBe(true)
    expect(result.ordered[0]!._creationTime).toBeGreaterThanOrEqual(
      result.ordered[1]!._creationTime,
    )
    expect(result.filtered).toHaveLength(5)
    expect(result.filtered.every((post) => post.status === 'published')).toBe(true)
    expect(result.taken).toHaveLength(2)
    expect(result.taken.every((post) => post.status === 'draft')).toBe(true)
    expect(result.first!.organizationId).toBe(orgId)
    expect(result.paged.page).toHaveLength(4)
    expect(result.paged.page.every((post) => post.organizationId === orgId)).toBe(true)
  })
})

describe('v2 experiment: resource loader and permissions', () => {
  it('allows own-resource updates, denies same-org non-owners, and allows admin overrides', async () => {
    const t = convexTest(schema, modules)
    const { anyApi } = await import('convex/server')
    const api = anyApi['experiments/v2_functions']

    const orgId = await seedOrg(t, 'Resource Org', 'resource-org')
    const ownPostId = await seedPost(t, { orgId, ownerId: 'member_1', title: 'Own post' })
    const otherPostId = await seedPost(t, { orgId, ownerId: 'member_2', title: 'Other post' })

    const ownUpdate = await t.mutation(api.updatePost, {
      id: ownPostId,
      title: 'Updated own post',
      ...asActor({ role: 'member', userId: 'member_1', orgId }),
    })
    expect(ownUpdate).toEqual({ updated: true, ownerId: 'member_1' })

    await expect(
      t.mutation(api.updatePost, {
        id: otherPostId,
        title: 'Should fail',
        ...asActor({ role: 'member', userId: 'member_1', orgId }),
      }),
    ).rejects.toThrow('Forbidden: post.update')

    const adminUpdate = await t.mutation(api.updatePost, {
      id: otherPostId,
      title: 'Admin override',
      ...asActor({ role: 'admin', userId: 'admin_1', orgId }),
    })
    expect(adminUpdate).toEqual({ updated: true, ownerId: 'member_2' })
  })

  it('blocks missing and cross-org resources before the handler runs', async () => {
    const t = convexTest(schema, modules)
    const { anyApi } = await import('convex/server')
    const api = anyApi['experiments/v2_functions']

    const orgA = await seedOrg(t, 'Org A', 'resource-org-a')
    const orgB = await seedOrg(t, 'Org B', 'resource-org-b')
    const postId = await seedPost(t, { orgId: orgA, ownerId: 'member_1', title: 'Scoped post' })
    const deletedId = await seedPost(t, { orgId: orgA, ownerId: 'member_1', title: 'Deleted post' })
    await t.run(async (ctx) => {
      await ctx.db.delete(deletedId)
    })

    await expect(
      t.mutation(api.updatePost, {
        id: deletedId,
        title: 'Missing',
        ...asActor({ role: 'admin', userId: 'admin_1', orgId: orgA }),
      }),
    ).rejects.toThrow('Resource not found.')

    await expect(
      t.mutation(api.updatePost, {
        id: postId,
        title: 'Cross org',
        ...asActor({ role: 'admin', userId: 'admin_1', orgId: orgB }),
      }),
    ).rejects.toThrow('Document belongs to a different organization.')
  })

  it('supports explicit cross-table resource loading for ownership checks', async () => {
    const t = convexTest(schema, modules)
    const { anyApi } = await import('convex/server')
    const createCommentOnOwnedPost = anyApi['experiments/v2_functions'].createCommentOnOwnedPost

    const orgId = await seedOrg(t, 'Comment Org', 'comment-org')
    const ownPostId = await seedPost(t, { orgId, ownerId: 'member_1', title: 'Own post' })
    const otherPostId = await seedPost(t, { orgId, ownerId: 'member_2', title: 'Other post' })

    const created = await t.mutation(createCommentOnOwnedPost, {
      postId: ownPostId,
      content: 'Allowed',
      ...asActor({ role: 'member', userId: 'member_1', orgId }),
    })
    expect(created.postOwnerId).toBe('member_1')

    await expect(
      t.mutation(createCommentOnOwnedPost, {
        postId: otherPostId,
        content: 'Denied',
        ...asActor({ role: 'member', userId: 'member_1', orgId }),
      }),
    ).rejects.toThrow('Forbidden: post.update')
  })
})
