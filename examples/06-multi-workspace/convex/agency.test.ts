/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { agencyPermissionKeys } from '../shared/permissions'
import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

function createCtx() {
  return createTestContext({ schema, modules })
}

describe('agency example', () => {
  it('keeps client users tenant-scoped', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: {} },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: { owner: {} },
    })

    await ctx.seed('memberships', {
      userId: alpha.users.owner.authId,
      workspaceId: alpha.id,
      role: 'owner',
      createdAt: Date.now(),
    })
    await ctx.seed('memberships', {
      userId: beta.users.owner.authId,
      workspaceId: beta.id,
      role: 'owner',
      createdAt: Date.now(),
    })

    await alpha.users.owner.mutation(api.projects.create, { name: 'Alpha project' })

    const betaProjects = await beta.users.owner.query(api.projects.list, {})
    expect(betaProjects).toHaveLength(0)
  })

  it('shows only assigned clients on the agency dashboard', async () => {
    const ctx = createCtx()
    const user = await ctx.seed('users', {
      authId: 'agent-1',
      email: 'agent@example.test',
      displayName: 'Agent',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const clientA = await ctx.seed('workspaces', {
      name: 'Client A',
      slug: 'client-a',
      ownerId: 'agent-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const clientB = await ctx.seed('workspaces', {
      name: 'Client B',
      slug: 'client-b',
      ownerId: 'agent-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const clientC = await ctx.seed('workspaces', {
      name: 'Client C',
      slug: 'client-c',
      ownerId: 'agent-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(user, { workspaceId: clientA } as never)
    })
    await ctx.seed('memberships', {
      userId: 'agent-1',
      workspaceId: clientA,
      role: 'agency_manager',
      createdAt: Date.now(),
    })
    await ctx.seed('memberships', {
      userId: 'agent-1',
      workspaceId: clientB,
      role: 'agency_manager',
      createdAt: Date.now(),
    })

    await ctx.seed('projects', {
      workspaceId: clientA,
      name: 'A',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.seed('projects', {
      workspaceId: clientB,
      name: 'B',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.seed('projects', {
      workspaceId: clientC,
      name: 'C',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const agent = ctx.raw.withIdentity({ subject: 'agent-1' })
    const portfolio = await agent.query(api.dashboard.portfolio, {})
    expect(portfolio).toHaveLength(2)
    expect(portfolio.map((entry) => entry.workspace.name).sort()).toEqual(['Client A', 'Client B'])
  })

  it('returns permission context booleans for owners and viewers inside a workspace', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: {},
        viewer: {},
      },
    })

    await ctx.seed('memberships', {
      userId: team.users.owner.authId,
      workspaceId: team.id,
      role: 'owner',
      createdAt: Date.now(),
    })
    await ctx.seed('memberships', {
      userId: team.users.viewer.authId,
      workspaceId: team.id,
      role: 'viewer',
      createdAt: Date.now(),
    })

    const ownerCtx = await team.users.owner.query(api.workspaces.getPermissionContext, {})
    const viewerCtx = await team.users.viewer.query(api.workspaces.getPermissionContext, {})

    expect(ownerCtx?.can[agencyPermissionKeys.projectCreate]).toBe(true)
    expect(viewerCtx?.can[agencyPermissionKeys.projectCreate]).toBe(false)
  })

  it('returns null context and denies the agency dashboard for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.workspaces.getPermissionContext, {})).resolves.toBeNull()
    await expect(ctx.raw.query(api.dashboard.portfolio, {})).rejects.toThrow('Not authenticated.')
  })

  it('prevents duplicate memberships when joining the same workspace twice', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: {},
        member: {},
      },
    })

    const workspaceId = await team.users.owner.mutation(api.workspaces.createWorkspace, {
      name: 'Client Workspace',
      slug: 'client-workspace',
    })

    await team.users.member.mutation(api.workspaces.joinWorkspace, {
      slug: 'client-workspace',
      role: 'member',
    })
    await team.users.member.mutation(api.workspaces.joinWorkspace, {
      slug: 'client-workspace',
      role: 'member',
    })

    const memberships = await ctx.readAll('memberships')
    const joinedMemberships = memberships.filter((membership) => {
      return (
        membership.userId === team.users.member.authId && membership.workspaceId === workspaceId
      )
    })

    expect(joinedMemberships).toHaveLength(1)
  })
})
