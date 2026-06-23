import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { api, components, internal } from './_generated/api'
import { createAuth } from './auth'
import schema from './schema'
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
    const teamMembers = await owner.query(api.teamAccess.listMembers, { teamId })

    expect(teamMembers).toEqual([
      {
        id: expect.any(String),
        teamId,
        userId: memberSeed.authUserId,
      },
    ])
    const [teamMember] = teamMembers
    expect(teamMember).not.toHaveProperty('_id')
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
