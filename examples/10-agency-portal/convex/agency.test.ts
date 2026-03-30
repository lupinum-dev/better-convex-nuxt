/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

vi.mock('./_generated/server', async () => {
  const server = await import('convex/server')
  return {
    query: server.query,
    mutation: server.mutation,
    action: server.action,
    internalQuery: server.internalQuery,
    internalMutation: server.internalMutation,
    internalAction: server.internalAction,
    httpAction: server.httpAction,
  }
})

function createCtx() {
  return createTestContext({
    schema,
    modules,
    tenant: {
      table: 'workspaces',
      field: 'workspaceId',
    },
    users: {
      table: 'users',
      authField: 'authId',
      tenantField: 'workspaceId',
      nameField: 'displayName',
      emailField: 'email',
    },
  })
}

describe('agency example', () => {
  it('keeps client users tenant-scoped', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: { owner: { role: 'owner' } },
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
    expect(portfolio.map(entry => entry.workspace.name).sort()).toEqual(['Client A', 'Client B'])
  })
})
