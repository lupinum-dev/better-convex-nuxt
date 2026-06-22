import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

type TestCtx = ReturnType<typeof convexTest>
type Role = 'owner' | 'admin' | 'member' | 'viewer'

async function seedUser(t: TestCtx, authUserId: string, email = `${authUserId}@example.com`) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      authUserId,
      name: authUserId,
      email,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })
}

async function seedOrg(t: TestCtx, userId: Id<'users'>, role: Role = 'owner') {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      createdBy: userId,
      createdAt: Date.now(),
    })
    await ctx.db.insert('memberships', {
      organizationId,
      userId,
      role,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return organizationId
  })
}

async function seedMembership(
  t: TestCtx,
  organizationId: Id<'organizations'>,
  userId: Id<'users'>,
  role: Role,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('memberships', {
      organizationId,
      userId,
      role,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })
}

async function seedInvitation(
  t: TestCtx,
  args: {
    organizationId: Id<'organizations'>
    createdBy: Id<'users'>
    email: string
    token: string
    status?: 'pending' | 'accepted' | 'revoked'
    expiresAt?: number
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('invitations', {
      organizationId: args.organizationId,
      email: args.email.toLowerCase(),
      role: 'member',
      token: args.token,
      status: args.status ?? 'pending',
      createdBy: args.createdBy,
      createdAt: Date.now(),
      expiresAt: args.expiresAt ?? Date.now() + 60_000,
    })
  })
}

describe('team starter invariants', () => {
  it('projects Better Auth users through the auth trigger path', async () => {
    const t = convexTest(schema, modules)

    await t.mutation(internal.auth.onCreate, {
      model: 'user',
      doc: {
        _id: 'auth_1',
        name: 'Ada',
        email: 'ada@example.com',
      },
    })

    const user = await t.withIdentity({ subject: 'auth_1' }).query(api.users.getCurrent, {})

    expect(user).toMatchObject({
      authUserId: 'auth_1',
      name: 'Ada',
      email: 'ada@example.com',
    })
  })

  it('does not lazily create a user projection from product mutations', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.withIdentity({ subject: 'missing_projection' }).mutation(api.organizations.create, {
        name: 'Acme',
      }),
    ).rejects.toThrow('User projection not ready')

    const users = await t.run(async (ctx) => {
      return await ctx.db.query('users').take(10)
    })
    expect(users).toHaveLength(0)
  })

  it('allows one user to belong to multiple organizations', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, 'user_1')
    await seedOrg(t, userId)
    await seedOrg(t, userId)

    const organizations = await t
      .withIdentity({ subject: 'user_1' })
      .query(api.organizations.listMine, {})

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

  it('membership removal denies product access through public APIs', async () => {
    const t = convexTest(schema, modules)
    const ownerId = await seedUser(t, 'owner')
    const memberId = await seedUser(t, 'member')
    const organizationId = await seedOrg(t, ownerId, 'owner')
    await seedMembership(t, organizationId, memberId, 'member')

    await t.withIdentity({ subject: 'owner' }).mutation(api.memberships.remove, {
      organizationId,
      userId: memberId,
    })

    await expect(
      t.withIdentity({ subject: 'member' }).mutation(api.projects.create, {
        organizationId,
        name: 'Blocked',
      }),
    ).rejects.toThrow('Organization access denied')
  })

  it('prevents removing or demoting the last owner', async () => {
    const t = convexTest(schema, modules)
    const ownerId = await seedUser(t, 'owner')
    const organizationId = await seedOrg(t, ownerId, 'owner')

    await expect(
      t.withIdentity({ subject: 'owner' }).mutation(api.memberships.remove, {
        organizationId,
        userId: ownerId,
      }),
    ).rejects.toThrow('Cannot remove the last owner')

    await expect(
      t.withIdentity({ subject: 'owner' }).mutation(api.memberships.updateRole, {
        organizationId,
        userId: ownerId,
        role: 'admin',
      }),
    ).rejects.toThrow('Cannot remove the last owner')
  })

  it('prevents admins from creating owner invitations', async () => {
    const t = convexTest(schema, modules)
    const ownerId = await seedUser(t, 'owner')
    const adminId = await seedUser(t, 'admin')
    const organizationId = await seedOrg(t, ownerId, 'owner')
    await seedMembership(t, organizationId, adminId, 'admin')

    await expect(
      t.withIdentity({ subject: 'admin' }).mutation(api.invitations.create, {
        organizationId,
        email: 'new-owner@example.com',
        role: 'owner' as 'member',
      }),
    ).rejects.toThrow()
  })

  it('requires invitation acceptance to match the current user email', async () => {
    const t = convexTest(schema, modules)
    const ownerId = await seedUser(t, 'owner')
    await seedUser(t, 'invited', 'other@example.com')
    const organizationId = await seedOrg(t, ownerId, 'owner')
    await seedInvitation(t, {
      organizationId,
      createdBy: ownerId,
      email: 'invited@example.com',
      token: 'wrong-email',
    })

    await expect(
      t.withIdentity({ subject: 'invited' }).mutation(api.invitations.accept, {
        token: 'wrong-email',
      }),
    ).rejects.toThrow('Invitation email does not match current user')
  })

  it('rejects expired and revoked invitations', async () => {
    const t = convexTest(schema, modules)
    const ownerId = await seedUser(t, 'owner')
    await seedUser(t, 'invited', 'invited@example.com')
    const organizationId = await seedOrg(t, ownerId, 'owner')
    await seedInvitation(t, {
      organizationId,
      createdBy: ownerId,
      email: 'invited@example.com',
      token: 'expired',
      expiresAt: Date.now() - 1,
    })
    const revokedInvitationId = await seedInvitation(t, {
      organizationId,
      createdBy: ownerId,
      email: 'invited@example.com',
      token: 'revoked',
    })

    await t.withIdentity({ subject: 'owner' }).mutation(api.invitations.revoke, {
      invitationId: revokedInvitationId,
    })

    await expect(
      t.withIdentity({ subject: 'invited' }).mutation(api.invitations.accept, {
        token: 'expired',
      }),
    ).rejects.toThrow('Invitation has expired')

    await expect(
      t.withIdentity({ subject: 'invited' }).mutation(api.invitations.accept, {
        token: 'revoked',
      }),
    ).rejects.toThrow('Invitation is not pending')
  })

  it('invite acceptance creates exactly one active membership', async () => {
    const t = convexTest(schema, modules)
    const ownerId = await seedUser(t, 'owner')
    const invitedUserId = await seedUser(t, 'invited', 'invited@example.com')
    const organizationId = await seedOrg(t, ownerId, 'owner')
    await seedInvitation(t, {
      organizationId,
      createdBy: ownerId,
      email: 'invited@example.com',
      token: 'invite-token',
    })

    await t.withIdentity({ subject: 'invited' }).mutation(api.invitations.accept, {
      token: 'invite-token',
    })

    await expect(
      t.withIdentity({ subject: 'invited' }).mutation(api.invitations.accept, {
        token: 'invite-token',
      }),
    ).rejects.toThrow('Invitation is not pending')

    const memberships = await t.run(async (ctx) => {
      return await ctx.db
        .query('memberships')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', organizationId).eq('userId', invitedUserId),
        )
        .take(10)
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
        name: 'Blocked',
      }),
    ).rejects.toThrow('Insufficient role')
  })

  it('caps project lists', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, 'member')
    const organizationId = await seedOrg(t, userId, 'member')

    await t.run(async (ctx) => {
      for (let i = 0; i < 101; i += 1) {
        await ctx.db.insert('projects', {
          organizationId,
          name: `Project ${i}`,
          createdBy: userId,
          createdAt: Date.now() + i,
        })
      }
    })

    const projects = await t
      .withIdentity({ subject: 'member' })
      .query(api.projects.list, { organizationId })

    expect(projects).toHaveLength(100)
  })
})
