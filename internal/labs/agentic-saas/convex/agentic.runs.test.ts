import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import {
  publicApi,
  internalApi,
  startRun,
  markRunRunningWithThread,
  startBetterAuthRun,
  createBetterAuthUser,
  createBetterAuthOrganization,
} from './agentic.test-helpers'
import { startDelegatedRunAfterPermissionCheck } from './agentRuns'
import { createAuth } from './auth'
import schema from './schema'
import { initConvexTest, modules } from './test.setup'

describe('agentic-saas delegated run lifecycle', () => {
  it('stores agent runs as bounded app-owned delegation keyed by Better Auth ids', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t, {
      capabilities: ['project:read', 'project:draft'],
    })

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))

    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      _id: agentRunId,
      organizationId: 'better-auth-org-id',
      agentName: 'project-assistant',
      status: 'active',
      startedByAuthUserId: 'better-auth-user-id',
      capabilities: ['project:read', 'project:draft'],
    })
    expect(runs[0].threadId).toBeUndefined()
  })

  it('does not reclassify terminal agent run states through lifecycle helpers', async () => {
    const t = convexTest(schema, modules)
    const failedRunId = await startRun(t)
    await markRunRunningWithThread(t, failedRunId, 'failed_run_thread')
    await t.mutation(internalApi.agentRuns.failRun, {
      agentRunId: failedRunId,
    })

    await expect(
      t.mutation(internalApi.agentRuns.completeRun, {
        agentRunId: failedRunId,
      }),
    ).rejects.toThrow('Agent run is not running')
    await expect(
      t.mutation(internalApi.agentRuns.attachThread, {
        agentRunId: failedRunId,
        threadId: 'failed_run_new_thread',
      }),
    ).rejects.toThrow('Agent run is not running')
    await expect(
      t.mutation(internalApi.agentRuns.failRun, {
        agentRunId: failedRunId,
      }),
    ).rejects.toThrow('Agent run is not active')

    const completedRunId = await startRun(t)
    await markRunRunningWithThread(t, completedRunId, 'completed_run_thread')
    await t.mutation(internalApi.agentRuns.completeRun, {
      agentRunId: completedRunId,
    })

    await expect(
      t.mutation(internalApi.agentRuns.failRun, {
        agentRunId: completedRunId,
      }),
    ).rejects.toThrow('Agent run is not active')
    await expect(
      t.mutation(internalApi.agentRuns.attachThread, {
        agentRunId: completedRunId,
        threadId: 'completed_run_new_thread',
      }),
    ).rejects.toThrow('Agent run is not running')

    const revokedRunId = await startRun(t)
    await t.run(async (ctx) => {
      await ctx.db.patch(revokedRunId, {
        status: 'revoked',
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.mutation(internalApi.agentRuns.failRun, {
        agentRunId: revokedRunId,
      }),
    ).rejects.toThrow('Agent run is not active')
    await expect(
      t.mutation(internalApi.agentRuns.completeRun, {
        agentRunId: revokedRunId,
      }),
    ).rejects.toThrow('Agent run is not running')

    const rows = await t.run(async (ctx) => ({
      failed: await ctx.db.get(failedRunId),
      completed: await ctx.db.get(completedRunId),
      revoked: await ctx.db.get(revokedRunId),
    }))

    expect(rows.failed).toMatchObject({
      status: 'failed',
      threadId: 'failed_run_thread',
    })
    expect(rows.completed).toMatchObject({
      status: 'completed',
      threadId: 'completed_run_thread',
    })
    expect(rows.revoked).toMatchObject({
      status: 'revoked',
    })
    expect(rows.revoked?.threadId).toBeUndefined()
  })

  it('normalizes delegated run names and capabilities before storing', async () => {
    const t = convexTest(schema, modules)
    const agentRunId = await startRun(t, {
      agentName: '  project-assistant  ',
      capabilities: ['project:draft', 'project:read', 'project:read'],
    })

    const run = await t.run(async (ctx) => await ctx.db.get(agentRunId))

    expect(run).toMatchObject({
      agentName: 'project-assistant',
      capabilities: ['project:read', 'project:draft'],
    })
  })

  it('checks Better Auth-style permissions before inserting a delegated run', async () => {
    const t = convexTest(schema, modules)
    const events: string[] = []

    const agentRunId = await t.run(async (ctx) => {
      return await startDelegatedRunAfterPermissionCheck(
        ctx,
        {
          organizationId: 'better-auth-org-id',
          agentName: 'project-assistant',
          startedByAuthUserId: 'better-auth-user-id',
          capabilities: ['project:read', 'project:draft', 'project:delete'],
        },
        async (permissionCtx, args) => {
          events.push(JSON.stringify(args))
          const runsBeforeInsert = await permissionCtx.db.query('agentRuns').take(10)
          expect(runsBeforeInsert).toHaveLength(0)

          return { authUserId: 'better-auth-user-id' }
        },
      )
    })

    expect(events).toEqual([
      JSON.stringify({
        organizationId: 'better-auth-org-id',
        permissions: {
          project: ['read', 'create', 'delete'],
        },
      }),
    ])

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      _id: agentRunId,
      organizationId: 'better-auth-org-id',
      startedByAuthUserId: 'better-auth-user-id',
      capabilities: ['project:read', 'project:draft', 'project:delete'],
    })
  })

  it('does not start a delegated run when the Better Auth-style permission check fails', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.run(async (ctx) => {
        return await startDelegatedRunAfterPermissionCheck(
          ctx,
          {
            organizationId: 'better-auth-org-id',
            agentName: 'project-assistant',
            startedByAuthUserId: 'better-auth-user-id',
            capabilities: ['project:delete'],
          },
          async () => {
            throw new Error('Missing project:delete permission')
          },
        )
      }),
    ).rejects.toThrow('Missing project:delete permission')

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(0)
  })

  it('does not start a delegated run for a different user than the permission check returned', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.run(async (ctx) => {
        return await startDelegatedRunAfterPermissionCheck(
          ctx,
          {
            organizationId: 'better-auth-org-id',
            agentName: 'project-assistant',
            startedByAuthUserId: 'better-auth-user-id',
            capabilities: ['project:draft'],
          },
          async () => ({ authUserId: 'other-better-auth-user-id' }),
        )
      }),
    ).rejects.toThrow('Permission check returned a different user')

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(0)
  })

  it('starts a delegated run only after live Better Auth organization permission succeeds', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)

    await expect(
      t.mutation(publicApi.agentRuns.startDelegatedRunWithBetterAuth, {
        organizationId,
        agentName: 'project-assistant',
        startedByAuthUserId: 'spoofed-delegating-user',
        sessionTokenForTest: owner.token,
        capabilities: ['project:draft'],
      }),
    ).rejects.toThrow('Unexpected field `startedByAuthUserId`')

    expect(await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))).toHaveLength(0)

    const agentRunId = await t.mutation(publicApi.agentRuns.startDelegatedRunWithBetterAuth, {
      organizationId,
      agentName: '  project-assistant  ',
      sessionTokenForTest: owner.token,
      capabilities: ['project:delete', 'project:draft', 'project:delete'],
    })

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      _id: agentRunId,
      organizationId,
      agentName: 'project-assistant',
      startedByAuthUserId: owner.userId,
      capabilities: ['project:draft', 'project:delete'],
    })
  })

  it('does not start a delegated run when live Better Auth organization permission fails', async () => {
    const t = initConvexTest()
    const { organizationId } = await createBetterAuthOrganization(t)
    const outsider = await createBetterAuthUser(t, 'agent-outsider@example.com')

    await expect(
      t.mutation(publicApi.agentRuns.startDelegatedRunWithBetterAuth, {
        organizationId,
        agentName: 'project-assistant',
        sessionTokenForTest: outsider.token,
        capabilities: ['project:draft'],
      }),
    ).rejects.toThrow(/Agent run permission denied|User is not a member of the organization/)

    const runs = await t.run(async (ctx) => await ctx.db.query('agentRuns').take(10))
    expect(runs).toHaveLength(0)
  })

  it('does not let a non-delegating member execute another user agent run', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const member = await createBetterAuthUser(t, 'agent-run-member@example.com')

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.addMember({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          userId: member.userId,
          role: 'member',
        },
      })
    })

    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId,
        sessionTokenForTest: member.token,
      }),
    ).rejects.toThrow('Only the delegating user can execute an agent run')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))

    expect(rows.run).toMatchObject({
      status: 'active',
      startedByAuthUserId: owner.userId,
    })
    expect(rows.run?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
    expect(rows.usage).toHaveLength(0)
  })

  it('allows only the delegating Better Auth user to revoke an agent run', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const viewer = await createBetterAuthUser(t, 'agent-revoke-viewer@example.com')
    const outsider = await createBetterAuthUser(t, 'agent-revoke-outsider@example.com')

    await t.run(async (ctx) => {
      const auth = await createAuth(ctx)
      await auth.api.addMember({
        headers: new Headers({ cookie: owner.sessionCookie }),
        body: {
          organizationId,
          userId: viewer.userId,
          role: 'viewer',
        },
      })
    })

    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await expect(
      t.mutation(publicApi.agentRuns.revokeRun, {
        organizationId: 'ignored-public-org',
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Unexpected field `organizationId`')

    await expect(
      t.mutation(publicApi.agentRuns.revokeRun, {
        agentRunId,
        sessionTokenForTest: outsider.token,
      }),
    ).rejects.toThrow(/Agent run revocation denied|User is not a member of the organization/)

    await expect(
      t.mutation(publicApi.agentRuns.revokeRun, {
        agentRunId,
        sessionTokenForTest: viewer.token,
      }),
    ).rejects.toThrow('Only the delegating user can revoke an agent run')

    await t.mutation(publicApi.agentRuns.revokeRun, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not active')

    const rows = await t.run(async (ctx) => ({
      run: await ctx.db.get(agentRunId),
      drafts: await ctx.db.query('projectDrafts').take(10),
      audit: await ctx.db.query('agentAuditEvents').take(10),
      usage: await ctx.db.query('agentUsageEvents').take(10),
    }))
    expect(rows.run).toMatchObject({
      status: 'revoked',
    })
    expect(rows.run?.threadId).toBeUndefined()
    expect(rows.drafts).toHaveLength(0)
    expect(rows.audit).toHaveLength(0)
    expect(rows.usage).toHaveLength(0)
  })

  it('does not revoke completed agent runs because they are readable history', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const agentRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    const result = await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.mutation(publicApi.agentRuns.revokeRun, {
        agentRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not revocable')

    await t.run(async (ctx) => {
      await ctx.db.patch(agentRunId, {
        expiresAt: Date.now() - 1,
      })
    })

    const messages = await t.query(publicApi.agentThreads.listAccessibleMessages, {
      agentRunId,
      sessionTokenForTest: owner.token,
    })
    const run = await t.run(async (ctx) => await ctx.db.get(agentRunId))

    expect(run).toMatchObject({
      status: 'completed',
      threadId: result.threadId,
    })
    expect((run as { expiresAt?: number } | null)?.expiresAt).toBeLessThanOrEqual(Date.now())
    expect(messages.messageCount).toBe(result.messageCount)
  })

  it('does not overwrite terminal agent run states from failed action attempts', async () => {
    const t = initConvexTest()
    const { owner, organizationId } = await createBetterAuthOrganization(t)
    const completedRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })

    await t.action(publicApi.agentTools.generateDraftWithTool, {
      agentRunId: completedRunId,
      sessionTokenForTest: owner.token,
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId: completedRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not active')

    const revokedRunId = await startBetterAuthRun(t, {
      organizationId,
      sessionTokenForTest: owner.token,
      capabilities: ['project:draft'],
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(revokedRunId, {
        status: 'revoked',
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.action(publicApi.agentTools.generateDraftWithTool, {
        agentRunId: revokedRunId,
        sessionTokenForTest: owner.token,
      }),
    ).rejects.toThrow('Agent run is not active')

    const rows = await t.run(async (ctx) => ({
      completed: await ctx.db.get(completedRunId),
      revoked: await ctx.db.get(revokedRunId),
    }))

    expect(rows.completed).toMatchObject({
      status: 'completed',
    })
    expect(rows.revoked).toMatchObject({
      status: 'revoked',
    })
  })
})
