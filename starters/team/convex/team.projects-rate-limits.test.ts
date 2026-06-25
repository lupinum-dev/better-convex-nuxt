import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import { initConvexTest } from './test.setup'
import {
  asActor,
  readRateLimitError,
  seedBetterAuthActor,
  seedBetterAuthOrganization,
  seedBetterAuthTeam,
  signUpBetterAuthUser,
  thirtyDaysMs,
} from './testHelpers'

describe('team starter project lifecycle and rate limits', () => {
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

  it('rate limits repeated project creation and exposes the same checked state to the UI', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_project_rate_limit' })
    const teamId = await seedBetterAuthTeam(t, {
      organizationId,
      teamId: 'team_project_rate_limit',
    })
    const owner = await seedBetterAuthActor(t, {
      label: 'owner_project_rate_limit',
      organizationId,
      role: 'owner',
    })

    const actor = asActor(t, {
      userId: owner.authUserId,
      sessionId: owner.sessionId,
    })

    const initialLimit = await actor.query(api.projects.getCreateRateLimit, { teamId })
    expect(initialLimit).toMatchObject({
      allowed: true,
      message: null,
      retryAfterMs: null,
    })

    for (let index = 0; index < 10; index += 1) {
      await actor.mutation(api.projects.create, {
        teamId,
        name: `Project ${index + 1}`,
      })
    }

    let error: unknown
    try {
      await actor.mutation(api.projects.create, {
        teamId,
        name: 'Project 11',
      })
    } catch (caught) {
      error = caught
    }

    expect(readRateLimitError(error)).toMatchObject({
      kind: 'RateLimited',
      name: 'projectCreate',
    })

    const depletedLimit = await actor.query(api.projects.getCreateRateLimit, { teamId })
    expect(depletedLimit.allowed).toBe(false)
    expect(depletedLimit.retryAfterMs).toBeGreaterThan(0)
    expect(depletedLimit.message).toMatch(
      /^Project creation is temporarily limited\. Try again in .+\.$/,
    )
  })

  it('rate limits repeated organization creation per authenticated user', async () => {
    const t = initConvexTest()
    const user = await signUpBetterAuthUser(t, {
      label: 'organization_rate_limit',
    })

    const actor = asActor(t, {
      userId: user.authUserId,
      sessionId: user.sessionId,
    })

    for (let index = 0; index < 5; index += 1) {
      await actor.mutation(api.organizations.create, {
        name: `Organization ${index + 1}`,
      })
    }

    let error: unknown
    try {
      await actor.mutation(api.organizations.create, {
        name: 'Organization 6',
      })
    } catch (caught) {
      error = caught
    }

    expect(readRateLimitError(error)).toMatchObject({
      kind: 'RateLimited',
      name: 'organizationCreate',
    })
  })

  it('rate limits repeated invitations per organization admin', async () => {
    const t = initConvexTest()
    const organizationId = await seedBetterAuthOrganization(t, { name: 'org_invite_rate_limit' })
    const ownerSeed = await seedBetterAuthActor(t, {
      label: 'owner_invite_rate_limit',
      organizationId,
      role: 'owner',
    })

    const owner = asActor(t, {
      userId: ownerSeed.authUserId,
      sessionId: ownerSeed.sessionId,
    })

    for (let index = 0; index < 12; index += 1) {
      await owner.mutation(api.organizations.inviteMember, {
        organizationId,
        email: `invite-rate-${index}@example.com`,
        role: 'member',
      })
    }

    let error: unknown
    try {
      await owner.mutation(api.organizations.inviteMember, {
        organizationId,
        email: 'invite-rate-12@example.com',
        role: 'member',
      })
    } catch (caught) {
      error = caught
    }

    expect(readRateLimitError(error)).toMatchObject({
      kind: 'RateLimited',
      name: 'inviteMember',
    })
  })
})
