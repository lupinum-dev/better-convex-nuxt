import { describe, expect, it } from 'vitest'

import { api, components } from './_generated/api'
import { initConvexTest } from './test.setup'
import {
  asActor,
  seedBetterAuthActor,
  seedBetterAuthOrganization,
  seedBetterAuthTeam,
} from './testHelpers'

describe('team starter audit and authorization invariants', () => {
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
          source: 'ui',
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
