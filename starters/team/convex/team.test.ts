import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

async function seedUser(t: ReturnType<typeof convexTest>, subject: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      subject,
      name: subject,
      email: `${subject}@example.com`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
  })
}

async function seedOrg(
  t: ReturnType<typeof convexTest>,
  userId: Id<'users'>,
  role: 'owner' | 'admin' | 'member' | 'viewer' = 'owner'
) {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      createdBy: userId,
      createdAt: Date.now()
    })
    await ctx.db.insert('memberships', {
      organizationId,
      userId,
      role,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    return organizationId
  })
}

describe('team starter invariants', () => {
  it('allows one user to belong to multiple organizations', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, 'user_1')
    await seedOrg(t, userId)
    await seedOrg(t, userId)

    const organizations = await t.withIdentity({ subject: 'user_1' }).query(api.organizations.listMine, {})

    expect(organizations).toHaveLength(2)
  })

  it('active membership grants product access', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, 'member')
    const organizationId = await seedOrg(t, userId, 'member')

    const projectId = await t
      .withIdentity({ subject: 'member' })
      .mutation(api.projects.create, { organizationId, name: 'Launch' })

    expect(projectId).toBeTruthy()
  })

  it('removed membership denies product access', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, 'removed')
    const organizationId = await seedOrg(t, userId, 'member')

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query('memberships')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', organizationId).eq('userId', userId)
        )
        .unique()
      await ctx.db.patch(membership!._id, { status: 'removed' })
    })

    await expect(
      t.withIdentity({ subject: 'removed' }).mutation(api.projects.create, {
        organizationId,
        name: 'Blocked'
      })
    ).rejects.toThrow('Organization access denied')
  })

  it('invite acceptance creates exactly one active membership', async () => {
    const t = convexTest(schema, modules)
    const ownerId = await seedUser(t, 'owner')
    const invitedUserId = await seedUser(t, 'invited')
    const organizationId = await seedOrg(t, ownerId, 'owner')

    await t.run(async (ctx) => {
      await ctx.db.insert('invitations', {
        organizationId,
        email: 'invited@example.com',
        role: 'member',
        token: 'invite-token',
        status: 'pending',
        createdBy: ownerId,
        createdAt: Date.now()
      })
    })

    await t.withIdentity({ subject: 'invited' }).mutation(api.invitations.accept, {
      token: 'invite-token'
    })

    const memberships = await t.run(async (ctx) => {
      return await ctx.db
        .query('memberships')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', organizationId).eq('userId', invitedUserId)
        )
        .collect()
    })

    expect(memberships).toHaveLength(1)
    expect(memberships[0]?.status).toBe('active')
  })

  it('viewer cannot create product data', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, 'viewer')
    const organizationId = await seedOrg(t, userId, 'viewer')

    await expect(
      t.withIdentity({ subject: 'viewer' }).mutation(api.projects.create, {
        organizationId,
        name: 'Blocked'
      })
    ).rejects.toThrow('Insufficient role')
  })
})
