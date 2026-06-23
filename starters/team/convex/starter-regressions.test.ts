import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { api, components, internal } from './_generated/api'
import { createAuth } from './auth'
import { initConvexTest } from './test.setup'

const now = 1_700_000_000_000

type Role = 'owner' | 'admin' | 'member' | 'viewer'

async function seedBetterAuthOrganization(
  t: ReturnType<typeof initConvexTest>,
  args: {
    name: string
  },
) {
  return await t.run(async (ctx) => {
    const organization = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'organization',
        data: {
          name: args.name,
          slug: args.name,
          createdAt: now,
        },
      },
    })) as { _id: string }

    return organization._id
  })
}

async function seedBetterAuthTeam(
  t: ReturnType<typeof initConvexTest>,
  args: {
    organizationId: string
    name: string
  },
) {
  return await t.run(async (ctx) => {
    const team = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'team',
        data: {
          name: args.name,
          organizationId: args.organizationId,
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as { _id: string }

    return team._id
  })
}

async function signUpBetterAuthUser(
  t: ReturnType<typeof initConvexTest>,
  args: {
    label: string
  },
) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx)
    const signedUp = await auth.api.signUpEmail({
      body: {
        email: `${args.label}@example.com`,
        password: 'password123',
        name: args.label,
      },
    })
    if (!signedUp.token) {
      throw new Error('Better Auth signup did not return a session token')
    }

    const session = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'session',
      where: [{ field: 'token', value: signedUp.token }],
    })) as { _id: string } | null
    if (!session) {
      throw new Error('Better Auth session row was not created')
    }

    return {
      authUserId: signedUp.user.id,
      sessionId: session._id,
    }
  })
}

async function seedBetterAuthMember(
  t: ReturnType<typeof initConvexTest>,
  args: {
    organizationId: string
    userId: string
    role: Role
  },
) {
  await t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'member',
        data: {
          organizationId: args.organizationId,
          userId: args.userId,
          role: args.role,
          createdAt: now,
        },
      },
    })
  })
}

async function seedBetterAuthUserRow(
  t: ReturnType<typeof initConvexTest>,
  args: {
    label: string
  },
) {
  return await t.run(async (ctx) => {
    const user = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'user',
        data: {
          name: args.label,
          email: `${args.label}@example.com`,
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as { _id?: string; id?: string }

    const userId = user.id ?? user._id
    if (!userId) {
      throw new Error('Better Auth user row missing id')
    }

    return userId
  })
}

function asActor(
  t: ReturnType<typeof initConvexTest>,
  args: {
    userId: string
    sessionId: string
  },
) {
  return t.withIdentity({
    subject: args.userId,
    sessionId: args.sessionId,
  } as Partial<UserIdentity>)
}

describe('team starter regressions', () => {
  it('clears nullable projection fields and deletes the projection row', async () => {
    const t = initConvexTest()
    const originalUser = {
      _id: 'auth_projection_1',
      name: 'Ada',
      email: 'ada@example.com',
      image: 'https://example.com/ada.png',
    }

    await t.mutation(internal.auth.onCreate, {
      model: 'user',
      doc: originalUser,
    })

    await t.mutation(internal.auth.onUpdate, {
      model: 'user',
      oldDoc: originalUser,
      newDoc: {
        ...originalUser,
        image: null,
      },
    })

    const projectedAfterUpdate = await t.run(async (ctx) => {
      return await ctx.db
        .query('users')
        .withIndex('by_auth_user_id', (q) => q.eq('authUserId', originalUser._id))
        .unique()
    })

    expect(projectedAfterUpdate).toMatchObject({
      authUserId: originalUser._id,
      name: 'Ada',
      email: 'ada@example.com',
    })
    expect(projectedAfterUpdate?.image).toBeUndefined()

    await t.mutation(internal.auth.onDelete, {
      model: 'user',
      doc: {
        ...originalUser,
        image: null,
      },
    })

    const projectedAfterDelete = await t.run(async (ctx) => {
      return await ctx.db
        .query('users')
        .withIndex('by_auth_user_id', (q) => q.eq('authUserId', originalUser._id))
        .unique()
    })

    expect(projectedAfterDelete).toBeNull()
  })

  it('lists every team member id after the first 100 rows', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, {
      name: 'org_team_member_pagination',
    })
    const teamId = await seedBetterAuthTeam(t, {
      organizationId,
      name: 'Team Members',
    })
    const ownerSeed = await signUpBetterAuthUser(t, {
      label: 'team_member_list_owner',
    })
    await seedBetterAuthMember(t, {
      organizationId,
      userId: ownerSeed.authUserId,
      role: 'owner',
    })

    await t.run(async (ctx) => {
      for (let index = 0; index < 105; index += 1) {
        await ctx.runMutation(components.betterAuth.adapter.create, {
          input: {
            model: 'teamMember',
            data: {
              teamId,
              userId: `team_member_${index}`,
              createdAt: now,
            },
          },
        })
      }
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    const memberIds = await owner.query(api.teams.listMemberIds, { teamId })

    expect(memberIds).toHaveLength(105)
    expect(new Set(memberIds).size).toBe(105)
    expect(memberIds).toContain('team_member_0')
    expect(memberIds).toContain('team_member_104')
  })

  it('lists every organization member after the first 100 rows', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, {
      name: 'org_member_pagination',
    })
    const ownerSeed = await signUpBetterAuthUser(t, {
      label: 'organization_member_list_owner',
    })
    await seedBetterAuthMember(t, {
      organizationId,
      userId: ownerSeed.authUserId,
      role: 'owner',
    })

    const seededUserIds: string[] = []
    for (let index = 0; index < 105; index += 1) {
      const label = `organization_member_${index}`
      const userId = await seedBetterAuthUserRow(t, { label })
      seededUserIds.push(userId)
      await seedBetterAuthMember(t, {
        organizationId,
        userId,
        role: 'member',
      })
    }

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    const members = await owner.query(api.organizations.listMembers, {
      organizationId,
    })

    expect(members).toHaveLength(106)
    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: ownerSeed.authUserId,
          role: 'owner',
        }),
        expect.objectContaining({
          userId: seededUserIds[0],
          role: 'member',
          user: expect.objectContaining({
            email: 'organization_member_0@example.com',
          }),
        }),
        expect.objectContaining({
          userId: seededUserIds[104],
          role: 'member',
          user: expect.objectContaining({
            email: 'organization_member_104@example.com',
          }),
        }),
      ]),
    )
  })
})
