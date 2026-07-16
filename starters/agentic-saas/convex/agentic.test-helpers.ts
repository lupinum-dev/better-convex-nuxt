/* eslint-disable @typescript-eslint/no-explicit-any -- test harness adds sessionTokenForTest outside public Convex args. */
import type { convexTest } from 'convex-test'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startDelegatedRunAfterPermissionCheck } from './agentRuns'
import { createAuth } from './auth'

export const publicApi = api as any

export const internalApi = internal as any

export type AgentCapability = 'project:read' | 'project:draft' | 'project:delete'

export async function startRun(
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{
    organizationId: string
    agentName: string
    capabilities: AgentCapability[]
    expiresAt: number
    maxTotalTokens: number
  }> = {},
) {
  return await t.run(async (ctx) => {
    return await startDelegatedRunAfterPermissionCheck(
      ctx,
      {
        organizationId: overrides.organizationId ?? 'better-auth-org-id',
        agentName: overrides.agentName ?? 'project-assistant',
        startedByAuthUserId: 'better-auth-user-id',
        capabilities: overrides.capabilities ?? ['project:draft'],
        ...(overrides.expiresAt === undefined ? {} : { expiresAt: overrides.expiresAt }),
        ...(overrides.maxTotalTokens === undefined
          ? {}
          : { maxTotalTokens: overrides.maxTotalTokens }),
      },
      async () => ({ authUserId: 'better-auth-user-id' }),
    )
  })
}

export async function markRunRunning(
  t: ReturnType<typeof convexTest>,
  agentRunId: Id<'agentRuns'>,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch(agentRunId, {
      status: 'running',
      updatedAt: Date.now(),
    })
  })
}

export async function markRunRunningWithThread(
  t: ReturnType<typeof convexTest>,
  agentRunId: Id<'agentRuns'>,
  threadId = `agent-thread-${agentRunId}`,
) {
  await markRunRunning(t, agentRunId)
  await t.mutation(internalApi.agentRuns.attachThread, {
    agentRunId,
    threadId,
  })
}

export async function createApprovedRecord(
  t: ReturnType<typeof convexTest>,
  args: {
    organizationId: string
    sessionTokenForTest: string
  },
) {
  const agentRunId = await startBetterAuthRun(t, {
    organizationId: args.organizationId,
    sessionTokenForTest: args.sessionTokenForTest,
    capabilities: ['project:draft'],
  })
  await markRunRunningWithThread(t, agentRunId)
  const draftId = await t.mutation(internalApi.projectDrafts.createFromAgent, {
    agentRunId,
    title: 'Approved launch plan',
    body: 'Canonical project record',
  })

  return await t.mutation(publicApi.projectDrafts.approve, {
    draftId,
    sessionTokenForTest: args.sessionTokenForTest,
  })
}

export async function startBetterAuthRun(
  t: ReturnType<typeof convexTest>,
  args: {
    organizationId: string
    sessionTokenForTest: string
    capabilities: AgentCapability[]
    maxTotalTokens?: number
  },
) {
  return (await t.mutation(publicApi.agentRuns.startDelegatedRunWithBetterAuth, {
    organizationId: args.organizationId,
    agentName: 'project-assistant',
    sessionTokenForTest: args.sessionTokenForTest,
    capabilities: args.capabilities,
    ...(args.maxTotalTokens === undefined ? {} : { maxTotalTokens: args.maxTotalTokens }),
  })) as Id<'agentRuns'>
}

export async function createBetterAuthUser(t: ReturnType<typeof convexTest>, email: string) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx)
    const password = 'Password123456!'
    const signedUp = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: email.split('@')[0],
      },
    })
    const signedIn = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    })
    if (!signedIn.token) {
      throw new Error('Better Auth sign-in did not return a session token')
    }

    return {
      email,
      token: signedIn.token,
      userId: signedUp.user.id,
    }
  })
}

export async function createBetterAuthOrganization(t: ReturnType<typeof convexTest>) {
  const owner = await createBetterAuthUser(t, 'agent-owner@example.com')

  const organization = await t.run(async (ctx) => {
    const auth = createAuth(ctx)
    return await auth.api.createOrganization({
      headers: new Headers({ authorization: `Bearer ${owner.token}` }),
      body: {
        name: 'Agent Org',
        slug: `agent-org-${Math.random().toString(36).slice(2)}`,
      },
    })
  })

  return {
    owner,
    organizationId: organization.id,
  }
}

export async function createBetterAuthOrganizationWithAdmin(t: ReturnType<typeof convexTest>) {
  const { owner, organizationId } = await createBetterAuthOrganization(t)
  const admin = await createBetterAuthUser(t, 'agent-admin@example.com')

  const adminMember = await t.run(async (ctx) => {
    const auth = createAuth(ctx)
    return await auth.api.addMember({
      headers: new Headers({ authorization: `Bearer ${owner.token}` }),
      body: {
        organizationId,
        userId: admin.userId,
        role: 'admin',
      },
    })
  })

  return {
    owner,
    admin,
    adminMember,
    organizationId,
  }
}
