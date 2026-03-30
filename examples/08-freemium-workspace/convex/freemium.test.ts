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
      roleField: 'role',
      tenantField: 'workspaceId',
      nameField: 'displayName',
      emailField: 'email',
    },
  })
}

describe('freemium example', () => {
  it('exposes the current plan and feature flags in context', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
      plan: 'free',
    })

    const permissionContext = await team.users.owner.query(api.workspaces.getPermissionContext, {})
    expect(permissionContext.plan).toBe('free')
    expect(permissionContext.can['workspace.exports']).toBe(false)
  })

  it('blocks free workspaces at the project limit', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
      plan: 'free',
    })

    await team.users.owner.mutation(api.projects.create, { name: 'One' })
    await team.users.owner.mutation(api.projects.create, { name: 'Two' })
    await team.users.owner.mutation(api.projects.create, { name: 'Three' })

    await expect(
      team.users.owner.mutation(api.projects.create, { name: 'Four' }),
    ).rejects.toThrow('Plan limit reached')
  })

  it('allows the same mutation after upgrading to pro', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
      plan: 'free',
    })

    await team.users.owner.mutation(api.projects.create, { name: 'One' })
    await team.users.owner.mutation(api.projects.create, { name: 'Two' })
    await team.users.owner.mutation(api.projects.create, { name: 'Three' })
    await team.users.owner.mutation(api.workspaces.upgradePlan, { plan: 'pro' })

    await expect(
      team.users.owner.mutation(api.projects.create, { name: 'Four' }),
    ).resolves.toBeDefined()
  })
})
