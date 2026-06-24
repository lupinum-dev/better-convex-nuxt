import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { api, components, internal } from './_generated/api'
import { createAuth } from './auth'
import schema from './schema'
import { initConvexTest } from './test.setup'

const now = 1_700_000_000_000

type Role = 'owner' | 'admin' | 'member' | 'viewer'
const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

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

async function seedBetterAuthActor(
  t: ReturnType<typeof initConvexTest>,
  args: {
    label: string
    organizationId: string
    role: Role
    teamIds?: string[]
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

    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'member',
        data: {
          organizationId: args.organizationId,
          userId: signedUp.user.id,
          role: args.role,
          createdAt: now,
        },
      },
    })

    for (const teamId of args.teamIds ?? []) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'teamMember',
          data: {
            teamId,
            userId: signedUp.user.id,
            createdAt: now,
          },
        },
      })
    }

    return {
      authUserId: signedUp.user.id,
      sessionId: session._id,
    }
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
      token: signedUp.token,
    }
  })
}

async function seedBetterAuthTeam(
  t: ReturnType<typeof initConvexTest>,
  args: {
    organizationId: string
    teamId: string
    name?: string
  },
) {
  return await t.run(async (ctx) => {
    const team = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'team',
        data: {
          name: args.name ?? args.teamId,
          organizationId: args.organizationId,
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as { _id: string }

    return team._id
  })
}

async function verifyBetterAuthUserEmail(
  t: ReturnType<typeof initConvexTest>,
  args: {
    userId: string
  },
) {
  await t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: 'user',
        where: [{ field: '_id', value: args.userId }],
        update: {
          emailVerified: true,
        },
      },
    })
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

describe('team starter invariants', () => {
  it('projects Better Auth users through the auth trigger path', async () => {
    const t = initConvexTest()

    await t.mutation(internal.auth.onCreate, {
      model: 'user',
      doc: {
        _id: 'auth_1',
        name: 'Ada',
        email: 'ada@example.com',
        image: 'https://example.com/ada.png',
      },
    })

    const users = await t.run(async (ctx) => {
      return await ctx.db.query('users').take(10)
    })

    expect(users).toHaveLength(1)
    const [projectedUser] = users
    expect(projectedUser).toMatchObject({
      authUserId: 'auth_1',
      name: 'Ada',
      email: 'ada@example.com',
      image: 'https://example.com/ada.png',
    })
  })

  it('keeps app-owned product rows separate from Better Auth ids', async () => {
    const t = initConvexTest()

    const projectId = await t.run(async (ctx) => {
      return await ctx.db.insert('projects', {
        organizationId: 'better-auth-org-id',
        teamId: 'better-auth-team-id',
        name: 'Launch',
        status: 'active',
        createdByAuthUserId: 'better-auth-user-id',
        createdAt: 1,
        updatedAt: 1,
      })
    })

    const auditEventId = await t.run(async (ctx) => {
      return await ctx.db.insert('auditEvents', {
        organizationId: 'better-auth-org-id',
        teamId: 'better-auth-team-id',
        actor: {
          kind: 'user',
          authUserId: 'better-auth-user-id',
        },
        action: 'project.create',
        resourceType: 'project',
        resourceId: projectId,
        summary: 'Created project Launch',
        createdAt: 1,
      })
    })

    const rows = await t.run(async (ctx) => {
      return {
        projects: await ctx.db.query('projects').take(10),
        auditEvents: await ctx.db.query('auditEvents').take(10),
      }
    })

    expect(rows.projects).toHaveLength(1)
    const [project] = rows.projects
    expect(project).toMatchObject({
      _id: projectId,
      organizationId: 'better-auth-org-id',
      teamId: 'better-auth-team-id',
      status: 'active',
      createdByAuthUserId: 'better-auth-user-id',
    })
    expect(rows.auditEvents).toHaveLength(1)
    const [auditEvent] = rows.auditEvents
    expect(auditEvent).toMatchObject({
      _id: auditEventId,
      organizationId: 'better-auth-org-id',
      teamId: 'better-auth-team-id',
      actor: {
        kind: 'user',
        authUserId: 'better-auth-user-id',
      },
      action: 'project.create',
      resourceId: projectId,
    })
  })

  it('lists only the caller organizations with Better Auth roles', async () => {
    const t = initConvexTest()
    const visibleOrganizationId = await seedBetterAuthOrganization(t, { name: 'org_visible' })
    const hiddenOrganizationId = await seedBetterAuthOrganization(t, { name: 'org_hidden' })
    const actorSeed = await seedBetterAuthActor(t, {
      label: 'org_list_actor',
      organizationId: visibleOrganizationId,
      role: 'admin',
    })
    await seedBetterAuthActor(t, {
      label: 'org_list_other',
      organizationId: hiddenOrganizationId,
      role: 'owner',
    })

    const actor = asActor(t, {
      userId: actorSeed.authUserId,
      sessionId: actorSeed.sessionId,
    })
    const organizations = await actor.query(api.organizations.listMine, {})

    expect(organizations).toEqual([
      {
        id: visibleOrganizationId,
        name: 'org_visible',
        role: 'admin',
      },
    ])
  })

  it('creates organizations through Better Auth and exposes them in the Convex list', async () => {
    const t = initConvexTest()
    const creatorSeed = await signUpBetterAuthUser(t, {
      label: 'organization_creator',
    })
    const creator = asActor(t, {
      userId: creatorSeed.authUserId,
      sessionId: creatorSeed.sessionId,
    })

    const organization = await creator.mutation(api.organizations.create, {
      name: 'Created Org',
    })
    const organizations = await creator.query(api.organizations.listMine, {})
    const rows = await t.run(async (ctx) => {
      const teams = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: 'team',
        where: [{ field: 'organizationId', value: organization.id }],
        paginationOpts: { cursor: null, numItems: 10 },
      })) as { page: Array<{ organizationId: string }> }
      const members = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: 'member',
        where: [{ field: 'organizationId', value: organization.id }],
        paginationOpts: { cursor: null, numItems: 10 },
      })) as { page: Array<{ organizationId: string; role: string; userId: string }> }

      return { teams: teams.page, members: members.page }
    })

    expect(organizations).toContainEqual({
      id: organization.id,
      name: 'Created Org',
      role: 'owner',
    })
    expect(rows.teams).toHaveLength(1)
    expect(rows.members).toHaveLength(1)
    expect(rows.members[0]).toMatchObject({
      organizationId: organization.id,
      role: 'owner',
      userId: creatorSeed.authUserId,
    })
  })

  it('renames organizations and reflects the change in listMine', async () => {
    const t = initConvexTest()
    const creatorSeed = await signUpBetterAuthUser(t, {
      label: 'organization_rename_owner',
    })
    const creator = asActor(t, {
      userId: creatorSeed.authUserId,
      sessionId: creatorSeed.sessionId,
    })
    const organization = await creator.mutation(api.organizations.create, {
      name: 'Before Rename',
    })

    await creator.mutation(api.organizations.rename, {
      organizationId: organization.id,
      name: 'After Rename',
    })

    const organizations = await creator.query(api.organizations.listMine, {})
    expect(organizations).toContainEqual({
      id: organization.id,
      name: 'After Rename',
      role: 'owner',
    })
  })

  it('renames teams and reflects the change in the organization team list', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_team_rename' })
    const teamId = await seedBetterAuthTeam(t, {
      organizationId,
      teamId: 'team_rename',
      name: 'Before Rename',
    })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_team_rename',
      organizationId,
      role: 'owner',
    })
    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })

    const renamedTeam = await owner.mutation(api.teams.rename, {
      teamId,
      name: 'After Rename',
    })
    const teams = await owner.query(api.organizations.listTeams, { organizationId })

    expect(renamedTeam).toEqual({
      id: teamId,
      name: 'After Rename',
      organizationId,
    })
    expect(teams).toContainEqual({
      id: teamId,
      name: 'After Rename',
      organizationId,
    })
  })

  it('rejects renaming a missing team', async () => {
    const t = initConvexTest()
    const ownerSeed = await signUpBetterAuthUser(t, {
      label: 'missing_team_rename_owner',
    })
    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })

    await expect(
      owner.mutation(api.teams.rename, {
        teamId: 'missing-team-id',
        name: 'Missing Team',
      }),
    ).rejects.toThrow(/Team not found/)
  })

  it('renames a team even when the session active organization points elsewhere', async () => {
    const t = initConvexTest()
    const primaryOrganizationId = await seedBetterAuthOrganization(t, {
      name: 'org_team_rename_primary',
    })
    const targetOrganizationId = await seedBetterAuthOrganization(t, {
      name: 'org_team_rename_target',
    })
    const targetTeamId = await seedBetterAuthTeam(t, {
      organizationId: targetOrganizationId,
      teamId: 'team_rename_target',
      name: 'Target Team',
    })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_team_rename_context',
      organizationId: primaryOrganizationId,
      role: 'owner',
    })

    await t.run(async (ctx) => {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'member',
          data: {
            organizationId: targetOrganizationId,
            userId: ownerSeed.authUserId,
            role: 'owner',
            createdAt: now,
          },
        },
      })

      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: 'session',
          where: [{ field: '_id', value: ownerSeed.sessionId }],
          update: {
            activeOrganizationId: primaryOrganizationId,
          },
        },
      })
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })

    const renamedTeam = await owner.mutation(api.teams.rename, {
      teamId: targetTeamId,
      name: 'Renamed Across Active Org',
    })
    const teams = await owner.query(api.organizations.listTeams, {
      organizationId: targetOrganizationId,
    })

    expect(renamedTeam).toEqual({
      id: targetTeamId,
      name: 'Renamed Across Active Org',
      organizationId: targetOrganizationId,
    })
    expect(teams).toContainEqual({
      id: targetTeamId,
      name: 'Renamed Across Active Org',
      organizationId: targetOrganizationId,
    })
  })

  it('models soft delete as reversible project state', async () => {
    const t = initConvexTest()

    const projectId = await t.run(async (ctx) => {
      return await ctx.db.insert('projects', {
        organizationId: 'better-auth-org-id',
        teamId: 'better-auth-team-id',
        name: 'Launch',
        status: 'active',
        createdByAuthUserId: 'better-auth-user-id',
        createdAt: 1,
        updatedAt: 1,
      })
    })

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        status: 'deleted',
        updatedAt: 2,
        deletedAt: 2,
        deletedByAuthUserId: 'better-auth-user-id',
      })
    })

    let project = await t.run(async (ctx) => await ctx.db.get(projectId))
    expect(project).toMatchObject({
      status: 'deleted',
      deletedAt: 2,
      deletedByAuthUserId: 'better-auth-user-id',
    })

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        status: 'active',
        updatedAt: 3,
        deletedAt: undefined,
        deletedByAuthUserId: undefined,
      })
    })

    project = await t.run(async (ctx) => await ctx.db.get(projectId))
    expect(project).toMatchObject({
      status: 'active',
      updatedAt: 3,
    })
    expect(project?.deletedAt).toBeUndefined()
    expect(project?.deletedByAuthUserId).toBeUndefined()
  })

  it('purges soft-deleted projects after 30 days', async () => {
    const t = initConvexTest()
    const staleDeletedAt = 1_000
    const purgeNow = staleDeletedAt + thirtyDaysMs + 1

    const [activeProjectId, staleDeletedProjectId, recentDeletedProjectId] = await t.run(
      async (ctx) => {
        return await Promise.all([
          ctx.db.insert('projects', {
            organizationId: 'org_purge',
            teamId: 'team_purge',
            name: 'Active Project',
            status: 'active',
            createdByAuthUserId: 'user_purge',
            createdAt: 1,
            updatedAt: 1,
          }),
          ctx.db.insert('projects', {
            organizationId: 'org_purge',
            teamId: 'team_purge',
            name: 'Stale Deleted Project',
            status: 'deleted',
            createdByAuthUserId: 'user_purge',
            createdAt: 1,
            updatedAt: staleDeletedAt,
            deletedAt: staleDeletedAt,
            deletedByAuthUserId: 'user_purge',
          }),
          ctx.db.insert('projects', {
            organizationId: 'org_purge',
            teamId: 'team_purge',
            name: 'Recent Deleted Project',
            status: 'deleted',
            createdByAuthUserId: 'user_purge',
            createdAt: 1,
            updatedAt: purgeNow,
            deletedAt: purgeNow,
            deletedByAuthUserId: 'user_purge',
          }),
        ])
      },
    )

    const result = await t.mutation(internal.projects.purgeSoftDeleted, {
      now: purgeNow,
    })

    expect(result).toEqual({
      deletedCount: 1,
      cutoff: purgeNow - thirtyDaysMs,
    })

    const [activeProject, staleDeletedProject, recentDeletedProject] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.get(activeProjectId),
        ctx.db.get(staleDeletedProjectId),
        ctx.db.get(recentDeletedProjectId),
      ])
    })

    expect(activeProject?.status).toBe('active')
    expect(staleDeletedProject).toBeNull()
    expect(recentDeletedProject?.status).toBe('deleted')
  })

  it('keeps management actions out of the product audit schema', async () => {
    const t = initConvexTest()

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert('auditEvents', {
          organizationId: 'better-auth-org-id',
          actor: {
            kind: 'user',
            authUserId: 'better-auth-user-id',
          },
          // @ts-expect-error - management actions are not part of product audit.
          action: 'member.remove',
          // @ts-expect-error - management resources are not part of product audit.
          resourceType: 'member',
          createdAt: 1,
        })
      }),
    ).rejects.toThrow(/Validator error/)
  })

  it('requires every project row to belong to a team', async () => {
    const t = initConvexTest()

    await expect(
      t.run(async (ctx) => {
        // @ts-expect-error - missing teamId should also be rejected at runtime.
        await ctx.db.insert('projects', {
          organizationId: 'better-auth-org-id',
          name: 'Launch',
          status: 'active',
          createdByAuthUserId: 'better-auth-user-id',
          createdAt: 1,
          updatedAt: 1,
        })
      }),
    ).rejects.toThrow(/Missing required field `teamId`/)
  })

  it('writes audit events in the same project mutation path', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_audit' })
    const teamId = await seedBetterAuthTeam(t, { organizationId, teamId: 'team_audit' })
    const owner = await seedBetterAuthActor(t, {
      label: 'owner_audit',
      organizationId,
      role: 'owner',
    })

    const actor = asActor(t, {
      userId: owner.authUserId,
      sessionId: owner.sessionId,
    })
    const projectId = await actor.mutation(api.projects.create, {
      teamId,
      name: 'Launch',
    })
    await actor.mutation(api.projects.rename, {
      projectId,
      name: 'Launch v2',
    })
    await actor.mutation(api.projects.softDelete, { projectId })
    await actor.mutation(api.projects.restore, { projectId })

    const rows = await t.run(async (ctx) => {
      return {
        project: await ctx.db.get(projectId),
        auditEvents: await ctx.db.query('auditEvents').take(10),
      }
    })

    expect(rows.project).toMatchObject({
      _id: projectId,
      organizationId,
      teamId,
      status: 'active',
      name: 'Launch v2',
      createdByAuthUserId: owner.authUserId,
    })
    expect(rows.auditEvents.map((event) => event.action)).toEqual([
      'project.create',
      'project.update',
      'project.delete',
      'project.restore',
    ])
    expect(rows.auditEvents.every((event) => event.resourceId === projectId)).toBe(true)
  })

  it('maps Better Auth team membership rows to app-owned DTOs', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_team_members' })
    const teamId = await seedBetterAuthTeam(t, {
      organizationId,
      teamId: 'team_members',
    })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_team_members',
      organizationId,
      role: 'owner',
    })
    const memberSeed = await seedBetterAuthActor(t, {
      label: 'member_team_members',
      organizationId,
      role: 'member',
      teamIds: [teamId],
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    const teamMembers = await owner.query(api.teams.listMemberIds, { teamId })

    expect(teamMembers).toEqual([memberSeed.authUserId])
  })

  it('lists teams by organization scope and visibility rules', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_teams_scope' })
    const otherOrganizationId = await seedBetterAuthOrganization(t, { name: 'org_other_scope' })
    const visibleTeamId = await seedBetterAuthTeam(t, {
      organizationId,
      teamId: 'team_visible',
      name: 'Visible Team',
    })
    await seedBetterAuthTeam(t, {
      organizationId,
      teamId: 'team_hidden',
      name: 'Hidden Team',
    })
    await seedBetterAuthTeam(t, {
      organizationId: otherOrganizationId,
      teamId: 'team_other_org',
      name: 'Other Org Team',
    })

    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_teams_scope',
      organizationId,
      role: 'owner',
    })
    const memberSeed = await seedBetterAuthActor(t, {
      label: 'member_teams_scope',
      organizationId,
      role: 'member',
      teamIds: [visibleTeamId],
    })
    await t.run(async (ctx) => {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'member',
          data: {
            organizationId: otherOrganizationId,
            userId: memberSeed.authUserId,
            role: 'member',
            createdAt: now,
          },
        },
      })
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    const member = asActor(t, {
      userId: memberSeed.authUserId,
      sessionId: memberSeed.sessionId,
    })

    const ownerTeams = await owner.query(api.organizations.listTeams, {
      organizationId,
    })
    const memberTeams = await member.query(api.organizations.listTeams, {
      organizationId,
    })

    expect(ownerTeams.every((team) => team.organizationId === organizationId)).toBe(true)
    expect(ownerTeams.map((team) => team.name).sort()).toEqual(['Hidden Team', 'Visible Team'])
    expect(memberTeams).toEqual([
      {
        id: visibleTeamId,
        name: 'Visible Team',
        organizationId,
      },
    ])
  })

  it('lists enriched members with valid roles', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_member_list' })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_member_list',
      organizationId,
      role: 'owner',
    })
    const adminSeed = await seedBetterAuthActor(t, {
      label: 'admin_member_list',
      organizationId,
      role: 'admin',
    })
    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })

    const members = await owner.query(api.organizations.listMembers, {
      organizationId,
    })

    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId,
          userId: ownerSeed.authUserId,
          role: 'owner',
          user: expect.objectContaining({
            email: 'owner_member_list@example.com',
          }),
        }),
        expect.objectContaining({
          organizationId,
          userId: adminSeed.authUserId,
          role: 'admin',
          user: expect.objectContaining({
            email: 'admin_member_list@example.com',
          }),
        }),
      ]),
    )
  })

  it('changes member roles and removal affects downstream authorization', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_membership_lifecycle' })
    const teamId = await seedBetterAuthTeam(t, {
      organizationId,
      teamId: 'team_membership_lifecycle',
    })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_membership_lifecycle',
      organizationId,
      role: 'owner',
    })
    const memberSeed = await seedBetterAuthActor(t, {
      label: 'member_membership_lifecycle',
      organizationId,
      role: 'member',
      teamIds: [teamId],
    })
    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    const member = asActor(t, {
      userId: memberSeed.authUserId,
      sessionId: memberSeed.sessionId,
    })

    const memberRows = await owner.query(api.organizations.listMembers, {
      organizationId,
    })
    const memberRow = memberRows.find((row) => row.userId === memberSeed.authUserId)
    if (!memberRow) {
      throw new Error('Expected member row to exist')
    }
    const projectId = await member.mutation(api.projects.create, {
      teamId,
      name: 'Mutable Role Project',
    })

    await owner.mutation(api.organizations.changeMemberRole, {
      organizationId,
      memberId: memberRow.id,
      role: 'viewer',
    })

    await expect(
      member.mutation(api.projects.rename, {
        projectId,
        name: 'Should Fail',
      }),
    ).rejects.toThrow(/Missing project:update permission/)

    await owner.mutation(api.organizations.removeMember, {
      organizationId,
      memberId: memberRow.id,
    })

    await expect(
      member.query(api.organizations.listTeams, {
        organizationId,
      }),
    ).rejects.toThrow(/User is not an organization member/)
  })

  it('completes the invitation lifecycle into organization and team membership', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_invite_accept' })
    const teamId = await seedBetterAuthTeam(t, {
      organizationId,
      teamId: 'team_invite_accept',
    })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_invite_accept',
      organizationId,
      role: 'owner',
    })
    const inviteeSeed = await signUpBetterAuthUser(t, {
      label: 'invitee_accept',
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    await owner.mutation(api.organizations.inviteMember, {
      organizationId,
      email: 'invitee_accept@example.com',
      role: 'member',
      teamId,
    })

    const invitationId = await t.run(async (ctx) => {
      const invitation = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'invitation',
        where: [
          { field: 'organizationId', value: organizationId },
          { field: 'email', value: 'invitee_accept@example.com' },
          { field: 'status', value: 'pending' },
        ],
      })) as { _id?: string; id?: string } | null

      return invitation?.id ?? invitation?._id ?? null
    })
    if (!invitationId) {
      throw new Error('Expected invitation row to exist')
    }

    const invitee = asActor(t, {
      userId: inviteeSeed.authUserId,
      sessionId: inviteeSeed.sessionId,
    })
    await expect(
      invitee.query(api.invitations.get, {
        invitationId,
      }),
    ).rejects.toThrow(/Verify your email/)

    await verifyBetterAuthUserEmail(t, {
      userId: inviteeSeed.authUserId,
    })

    const invitation = await invitee.query(api.invitations.get, {
      invitationId,
    })
    expect(invitation).toMatchObject({
      organizationId,
      email: 'invitee_accept@example.com',
      role: 'member',
      teamId,
      status: 'pending',
    })

    await invitee.mutation(api.invitations.accept, {
      invitationId,
    })

    const [memberRow, teamMemberRow] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.runQuery(components.betterAuth.adapter.findOne, {
          model: 'member',
          where: [
            { field: 'organizationId', value: organizationId },
            { field: 'userId', value: inviteeSeed.authUserId },
          ],
        }),
        ctx.runQuery(components.betterAuth.adapter.findOne, {
          model: 'teamMember',
          where: [
            { field: 'teamId', value: teamId },
            { field: 'userId', value: inviteeSeed.authUserId },
          ],
        }),
      ])
    })

    expect(memberRow).toMatchObject({
      organizationId,
      userId: inviteeSeed.authUserId,
      role: 'member',
    })
    expect(teamMemberRow).toMatchObject({
      teamId,
      userId: inviteeSeed.authUserId,
    })
  })

  it('can reject an invitation without creating membership rows', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_invite_reject' })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_invite_reject',
      organizationId,
      role: 'owner',
    })
    const inviteeSeed = await signUpBetterAuthUser(t, {
      label: 'invitee_reject',
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    await owner.mutation(api.organizations.inviteMember, {
      organizationId,
      email: 'invitee_reject@example.com',
      role: 'viewer',
    })

    const invitationId = await t.run(async (ctx) => {
      const invitation = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'invitation',
        where: [
          { field: 'organizationId', value: organizationId },
          { field: 'email', value: 'invitee_reject@example.com' },
          { field: 'status', value: 'pending' },
        ],
      })) as { _id?: string; id?: string } | null

      return invitation?.id ?? invitation?._id ?? null
    })
    if (!invitationId) {
      throw new Error('Expected invitation row to exist')
    }

    const invitee = asActor(t, {
      userId: inviteeSeed.authUserId,
      sessionId: inviteeSeed.sessionId,
    })
    await verifyBetterAuthUserEmail(t, {
      userId: inviteeSeed.authUserId,
    })
    await invitee.mutation(api.invitations.reject, {
      invitationId,
    })

    const memberRow = await t.run(async (ctx) => {
      return await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'member',
        where: [
          { field: 'organizationId', value: organizationId },
          { field: 'userId', value: inviteeSeed.authUserId },
        ],
      })
    })

    expect(memberRow).toBeNull()
  })

  it('lists and cancels pending invitations without exposing invitation ids', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_invite_cancel' })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_invite_cancel',
      organizationId,
      role: 'owner',
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    await owner.mutation(api.organizations.inviteMember, {
      organizationId,
      email: 'pending_cancel@example.com',
      role: 'admin',
    })

    const invitations = await owner.query(api.organizations.listInvitations, {
      organizationId,
    })
    expect(invitations).toEqual([
      expect.objectContaining({
        email: 'pending_cancel@example.com',
        role: 'admin',
        status: 'pending',
      }),
    ])
    expect('id' in invitations[0]!).toBe(false)

    await owner.mutation(api.organizations.cancelInvitation, {
      organizationId,
      email: 'pending_cancel@example.com',
    })

    const remainingInvitations = await owner.query(api.organizations.listInvitations, {
      organizationId,
    })
    expect(remainingInvitations).toEqual([])
  })

  it('adds and removes team members through the Convex teams API', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_team_management' })
    const otherOrganizationId = await seedBetterAuthOrganization(t, {
      name: 'org_team_management_other',
    })
    const teamId = await seedBetterAuthTeam(t, {
      organizationId,
      teamId: 'team_management',
    })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_team_management',
      organizationId,
      role: 'owner',
    })
    const memberSeed = await seedBetterAuthActor(t, {
      label: 'member_team_management',
      organizationId,
      role: 'member',
    })
    const outsiderSeed = await seedBetterAuthActor(t, {
      label: 'outsider_team_management',
      organizationId: otherOrganizationId,
      role: 'owner',
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    const outsider = asActor(t, {
      userId: outsiderSeed.authUserId,
      sessionId: outsiderSeed.sessionId,
    })

    await owner.mutation(api.teams.addMember, {
      teamId,
      userId: memberSeed.authUserId,
    })
    expect(await owner.query(api.teams.listMemberIds, { teamId })).toEqual([memberSeed.authUserId])

    await expect(
      outsider.mutation(api.teams.addMember, {
        teamId,
        userId: outsiderSeed.authUserId,
      }),
    ).rejects.toThrow(/permission|organization member|organization/i)

    await owner.mutation(api.teams.removeMember, {
      teamId,
      userId: memberSeed.authUserId,
    })
    expect(await owner.query(api.teams.listMemberIds, { teamId })).toEqual([])
  })

  it('limits organization audit to organization activity roles', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_activity' })
    const ownerTeamId = await seedBetterAuthTeam(t, {
      organizationId,
      teamId: 'team_activity_owner',
    })
    const memberTeamId = await seedBetterAuthTeam(t, {
      organizationId,
      teamId: 'team_activity_member',
    })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_activity',
      organizationId,
      role: 'owner',
    })
    const memberSeed = await seedBetterAuthActor(t, {
      label: 'member_activity',
      organizationId,
      role: 'member',
      teamIds: [memberTeamId],
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    const member = asActor(t, {
      userId: memberSeed.authUserId,
      sessionId: memberSeed.sessionId,
    })
    await owner.mutation(api.projects.create, {
      teamId: ownerTeamId,
      name: 'Private Team Project',
    })

    await expect(
      member.query(api.audit.listForOrganization, {
        organizationId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow(/Missing organization activity permission/)

    const ownerAudit = await owner.query(api.audit.listForOrganization, {
      organizationId,
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(ownerAudit.page.map((event) => event.action)).toEqual(['project.create'])
  })

  it('enforces organization role permissions and team membership for project access', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_matrix' })
    const teamId = await seedBetterAuthTeam(t, { organizationId, teamId: 'team_matrix' })
    const otherTeamId = await seedBetterAuthTeam(t, { organizationId, teamId: 'team_other' })

    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_matrix',
      organizationId,
      role: 'owner',
    })
    const memberSeed = await seedBetterAuthActor(t, {
      label: 'member_matrix',
      organizationId,
      role: 'member',
      teamIds: [teamId],
    })
    const viewerSeed = await seedBetterAuthActor(t, {
      label: 'viewer_matrix',
      organizationId,
      role: 'viewer',
      teamIds: [teamId],
    })
    const outsiderSeed = await seedBetterAuthActor(t, {
      label: 'outsider_matrix',
      organizationId,
      role: 'member',
      teamIds: [otherTeamId],
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })
    const member = asActor(t, {
      userId: memberSeed.authUserId,
      sessionId: memberSeed.sessionId,
    })
    const viewer = asActor(t, {
      userId: viewerSeed.authUserId,
      sessionId: viewerSeed.sessionId,
    })
    const outsider = asActor(t, {
      userId: outsiderSeed.authUserId,
      sessionId: outsiderSeed.sessionId,
    })

    const ownerProjectId = await owner.mutation(api.projects.create, {
      teamId,
      name: 'Owner Project',
    })
    const memberProjectId = await member.mutation(api.projects.create, {
      teamId,
      name: 'Member Project',
    })

    await expect(
      viewer.mutation(api.projects.create, {
        teamId,
        name: 'Viewer Project',
      }),
    ).rejects.toThrow(/Missing project:create permission/)

    await expect(
      outsider.query(api.projects.list, {
        teamId,
        status: 'active',
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow(/User is not a member of the team/)

    const viewerProjects = await viewer.query(api.projects.list, {
      teamId,
      status: 'active',
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(viewerProjects.page.map((project) => project._id).sort()).toEqual(
      [memberProjectId, ownerProjectId].sort(),
    )

    await member.mutation(api.projects.rename, {
      projectId: memberProjectId,
      name: 'Member Project v2',
    })
    await expect(
      member.mutation(api.projects.softDelete, {
        projectId: memberProjectId,
      }),
    ).rejects.toThrow(/Missing project:delete permission/)
  })

  it('keeps soft-deleted projects out of active queries until restored', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_lifecycle' })
    const teamId = await seedBetterAuthTeam(t, { organizationId, teamId: 'team_lifecycle' })
    const owner = await seedBetterAuthActor(t, {
      label: 'owner_lifecycle',
      organizationId,
      role: 'owner',
    })

    const actor = asActor(t, {
      userId: owner.authUserId,
      sessionId: owner.sessionId,
    })
    const projectId = await actor.mutation(api.projects.create, {
      teamId,
      name: 'Lifecycle Project',
    })

    await actor.mutation(api.projects.softDelete, { projectId })

    const activeAfterDelete = await actor.query(api.projects.list, {
      teamId,
      status: 'active',
      paginationOpts: { cursor: null, numItems: 10 },
    })
    const deletedAfterDelete = await actor.query(api.projects.list, {
      teamId,
      status: 'deleted',
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(activeAfterDelete.page.map((project) => project._id)).not.toContain(projectId)
    expect(deletedAfterDelete.page.map((project) => project._id)).toContain(projectId)
    await expect(
      actor.mutation(api.projects.rename, {
        projectId,
        name: 'Renamed While Deleted',
      }),
    ).rejects.toThrow(/Deleted projects must be restored before renaming/)

    await actor.mutation(api.projects.restore, { projectId })

    const activeAfterRestore = await actor.query(api.projects.list, {
      teamId,
      status: 'active',
      paginationOpts: { cursor: null, numItems: 10 },
    })
    const deletedAfterRestore = await actor.query(api.projects.list, {
      teamId,
      status: 'deleted',
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(activeAfterRestore.page.map((project) => project._id)).toContain(projectId)
    expect(deletedAfterRestore.page.map((project) => project._id)).not.toContain(projectId)
  })
})
