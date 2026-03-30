/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

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

  it('denies exportProjects on the free plan and allows it after upgrade', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
      plan: 'free',
    })

    await team.users.owner.mutation(api.projects.create, { name: 'One' })
    await expect(team.users.owner.query(api.projects.exportProjects, {})).rejects.toThrow(
      'Forbidden: Export projects',
    )

    await team.users.owner.mutation(api.workspaces.upgradePlan, { plan: 'pro' })
    await expect(team.users.owner.query(api.projects.exportProjects, {})).resolves.toContain('One')
  })

  it('returns permission context booleans for free and pro workspaces', async () => {
    const ctx = createCtx()
    const free = await ctx.seedTenant({
      name: 'Free',
      users: { owner: { role: 'owner' } },
      plan: 'free',
    })
    const pro = await ctx.seedTenant({
      name: 'Pro',
      users: { owner: { role: 'owner' } },
      plan: 'pro',
    })

    const freeCtx = await free.users.owner.query(api.workspaces.getPermissionContext, {})
    const proCtx = await pro.users.owner.query(api.workspaces.getPermissionContext, {})

    expect(freeCtx?.can['workspace.exports']).toBe(false)
    expect(proCtx?.can['workspace.exports']).toBe(true)
  })

  it('returns null context and rejects protected project queries for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.workspaces.getPermissionContext, {})).resolves.toBeNull()
    await expect(ctx.raw.query(api.projects.list, {})).rejects.toThrow('Not authenticated.')
  })
})
