import { describe, expect, it } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('better-convex-nuxt/testing', () => {
  it('seeds a tenant and returns authenticated user callers', async () => {
    const ctx = createTestContext({
    schema,
    modules,
    tenant: { table: 'organizations', field: 'organizationId' },
  })

    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        alice: { role: 'member' },
        bob: { role: 'viewer' },
      },
    })

    expect(team.id).toBeDefined()
    expect(team.users.alice.authId).toContain('acme-alice')

    const postId = await team.users.alice.mutation(api.posts.create, {
      title: 'Seeded by helper',
      content: 'This goes through the real scoped mutation.',
    })

    const alicePosts = await team.users.alice.query(api.posts.list, {})
    expect(alicePosts).toHaveLength(1)
    expect(alicePosts[0]?._id).toBe(postId)

    await expect(
      team.users.bob.mutation(api.posts.publish, { id: postId }),
    ).rejects.toThrow('Forbidden: post.publish')
  })

  it('injects service auth with the same permission rules as browser callers', async () => {
    const ctx = createTestContext({
    schema,
    modules,
    tenant: { table: 'organizations', field: 'organizationId' },
  })
    const team = await ctx.seedTenant({
      name: 'Globex',
      users: {
        viewer: { role: 'viewer' },
      },
    })

    const service = ctx.asService({
      userId: team.users.viewer.authId,
      role: 'viewer',
      tenantId: team.id,
    })

    await expect(
      service.mutation(api.posts.create, {
        title: 'Nope',
        content: 'Viewers should not create posts.',
      }),
    ).rejects.toThrow('Forbidden: post.create')
  })
})
