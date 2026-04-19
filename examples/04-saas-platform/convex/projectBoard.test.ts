/**
 * Why this file exists:
 * Example 04 is meant to show real month-two patterns, not just UI polish.
 * These tests prove tenant isolation, guard behavior, bulk semantics, and principal-forwarding parity.
 */
/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { describe, expect, it } from 'vitest'

import { saasPermissionKeys } from '../shared/permissions'
import { api } from './_generated/api'
import * as filesDomain from './domain/files'
import schema from './schema'
import { modules } from './test.setup'

function createCtx() {
  return createTestContext({ schema, modules })
}

describe('project board example', () => {
  it('lets a member update their own task but not another member`s task', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: {
        owner: { role: 'owner' },
        alice: { role: 'member' },
        bob: { role: 'member' },
      },
    })

    const projectId = await team.users.owner.mutation(api.domain.projects.create, {
      name: 'Board',
      summary: 'Alpha board',
    })
    const taskId = await team.users.alice.mutation(api.domain.tasks.create, {
      projectId,
      title: 'Alice task',
      priority: 'medium',
    })

    await team.users.alice.mutation(api.domain.tasks.moveToColumn, {
      id: taskId,
      status: 'in_progress',
    })

    await expect(
      team.users.bob.mutation(api.domain.tasks.moveToColumn, {
        id: taskId,
        status: 'done',
      }),
    ).rejects.toThrow('Forbidden: Update task')
  })

  it('lets viewers comment but blocks them from creating tasks', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const projectId = await team.users.owner.mutation(api.domain.projects.create, {
      name: 'Board',
      summary: 'Alpha board',
    })
    const taskId = await team.users.owner.mutation(api.domain.tasks.create, {
      projectId,
      title: 'Seed task',
      priority: 'medium',
    })

    await team.users.viewer.mutation(api.domain.comments.create, {
      taskId,
      body: 'Viewer feedback',
    })

    await expect(
      team.users.viewer.mutation(api.domain.tasks.create, {
        projectId,
        title: 'Nope',
        priority: 'medium',
      }),
    ).rejects.toThrow('Forbidden: Create task')
  })

  it('blocks task creation in archived projects through cross-table resource + guard', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: {
        owner: { role: 'owner' },
      },
    })

    const projectId = await team.users.owner.mutation(api.domain.projects.create, {
      name: 'Archive me',
      summary: 'Soon frozen',
    })
    await team.users.owner.mutation(api.domain.projects.archive, { id: projectId })

    await expect(
      team.users.owner.mutation(api.domain.tasks.create, {
        projectId,
        title: 'Should fail',
        priority: 'medium',
      }),
    ).rejects.toThrow('Cannot add tasks to archived projects.')
  })

  it('keeps tenants isolated from each other', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: {
        owner: { role: 'owner' },
      },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      plan: 'free',
      users: {
        owner: { role: 'owner' },
      },
    })

    const alphaProject = await alpha.users.owner.mutation(api.domain.projects.create, {
      name: 'Alpha board',
      summary: 'A',
    })
    const betaProject = await beta.users.owner.mutation(api.domain.projects.create, {
      name: 'Beta board',
      summary: 'B',
    })

    await alpha.users.owner.mutation(api.domain.tasks.create, {
      projectId: alphaProject,
      title: 'Alpha task',
      priority: 'medium',
    })
    await beta.users.owner.mutation(api.domain.tasks.create, {
      projectId: betaProject,
      title: 'Beta task',
      priority: 'medium',
    })

    const alphaTasks = await alpha.users.owner.query(api.domain.tasks.listByProject, {
      projectId: alphaProject,
    })
    const betaTasks = await beta.users.owner.query(api.domain.tasks.listByProject, {
      projectId: betaProject,
    })

    expect(alphaTasks).toHaveLength(1)
    expect(alphaTasks[0]?.title).toBe('Alpha task')
    expect(betaTasks).toHaveLength(1)
    expect(betaTasks[0]?.title).toBe('Beta task')
  })

  it('returns resource not found when another workspace asks for a project by id', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      plan: 'free',
      users: { owner: { role: 'owner' } },
    })

    const alphaProject = await alpha.users.owner.mutation(api.domain.projects.create, {
      name: 'Alpha board',
      summary: 'A',
    })

    await expect(beta.users.owner.query(api.domain.projects.get, { id: alphaProject })).rejects.toThrow(
      'Document belongs to a different tenant.',
    )
  })

  it('returns resource not found when another workspace tries to comment on a task by id', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      plan: 'free',
      users: { owner: { role: 'owner' } },
    })

    const projectId = await alpha.users.owner.mutation(api.domain.projects.create, {
      name: 'Alpha board',
      summary: 'A',
    })
    const taskId = await alpha.users.owner.mutation(api.domain.tasks.create, {
      projectId,
      title: 'Alpha task',
      priority: 'medium',
    })

    await expect(
      beta.users.owner.mutation(api.domain.comments.create, {
        taskId,
        body: 'Cross-tenant comment',
      }),
    ).rejects.toThrow('Document belongs to a different tenant.')
  })

  it('excludes users without a workspace from the scoped member list', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: {
        owner: { role: 'owner' },
        member: { role: 'member' },
      },
    })

    await ctx.seed('users', {
      authId: 'floating-user',
      email: 'floating-user@example.test',
      displayName: 'Floating User',
      role: 'viewer',
      workspaceId: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const members = await team.users.owner.query(api.domain.members.list, {})

    expect(members).toHaveLength(2)
    expect(
      members.find((member: (typeof members)[number]) => member.authId === 'floating-user'),
    ).toBeUndefined()
  })

  it('does not expose a raw storage-url query anymore', async () => {
    expect(filesDomain).not.toHaveProperty('getUrl')
  })

  it('bulk updates only the member-owned tasks and reports skipped ids', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: {
        owner: { role: 'owner' },
        alice: { role: 'member' },
        bob: { role: 'member' },
      },
    })

    const projectId = await team.users.owner.mutation(api.domain.projects.create, {
      name: 'Board',
      summary: 'Bulk demo',
    })
    const aliceTask = await team.users.alice.mutation(api.domain.tasks.create, {
      projectId,
      title: 'Alice task',
      priority: 'medium',
    })
    const bobTask = await team.users.bob.mutation(api.domain.tasks.create, {
      projectId,
      title: 'Bob task',
      priority: 'medium',
    })

    const result = await team.users.alice.mutation(api.domain.tasks.bulkUpdateStatus, {
      ids: [aliceTask, bobTask],
      status: 'done',
    })

    expect(result.updated).toBe(1)
    expect(result.skipped).toHaveLength(1)
  })

  it('forwarded principals obey the same permission rules as browser users', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const projectId = await team.users.owner.mutation(api.domain.projects.create, {
      name: 'Board',
      summary: 'Service auth',
    })

    const trustedCaller = ctx.asPrincipal({
      kind: 'user',
      userId: team.users.viewer.authId,
    })

    await expect(
      trustedCaller.mutation(api.domain.tasks.create, {
        projectId,
        title: 'Nope',
        priority: 'medium',
      }),
    ).rejects.toThrow(
      'Forwarded `principal` is only allowed on verified trusted caller paths.',
    )
  })

  it('role changes update the permission context and block future mutations', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: {
        owner: { role: 'owner' },
        member: { role: 'member' },
      },
    })

    const projectId = await team.users.owner.mutation(api.domain.projects.create, {
      name: 'Board',
      summary: 'Role flip',
    })

    const before = await team.users.member.query(api.permissions.context.getPermissionContext, {})
    expect(before?.role).toBe('member')

    await team.users.owner.mutation(api.domain.members.changeRole, {
      userId: team.users.member.id,
      newRole: 'viewer',
    })

    const after = await team.users.member.query(api.permissions.context.getPermissionContext, {})
    expect(after?.role).toBe('viewer')

    await expect(
      team.users.member.mutation(api.domain.tasks.create, {
        projectId,
        title: 'Blocked after downgrade',
        priority: 'medium',
      }),
    ).rejects.toThrow('Forbidden: Create task')
  })

  it('returns permission context booleans for owners and viewers', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      plan: 'free',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.permissions.context.getPermissionContext, {})
    const viewerCtx = await team.users.viewer.query(api.permissions.context.getPermissionContext, {})

    expect(ownerCtx?.can[saasPermissionKeys.taskCreate]).toBe(true)
    expect(ownerCtx?.can[saasPermissionKeys.workspaceMembers]).toBe(true)
    expect(viewerCtx?.can[saasPermissionKeys.taskCreate]).toBe(false)
    expect(viewerCtx?.can[saasPermissionKeys.workspaceMembers]).toBe(false)
  })

  it('returns null context and rejects protected mutations for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.permissions.context.getPermissionContext, {})).resolves.toBeNull()
    await expect(
      ctx.raw.mutation(api.domain.projects.create, {
        name: 'Anonymous project',
        summary: 'Should fail',
      }),
    ).rejects.toThrow('Forbidden: Create project')
  })
})

describe('plan entitlements', () => {
  it('exposes the current plan and feature flags in context', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
      plan: 'free',
    })

    const permCtx = await team.users.owner.query(api.permissions.context.getPermissionContext, {})
    expect(permCtx).not.toBeNull()
    if (!permCtx) throw new Error('Expected a permission context for the seeded owner.')
    expect(permCtx.plan).toBe('free')
    expect(permCtx.can[saasPermissionKeys.workspaceExports]).toBe(false)
  })

  it('blocks free workspaces at the project limit', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
      plan: 'free',
    })

    await team.users.owner.mutation(api.domain.projects.create, { name: 'One', summary: 'a' })
    await team.users.owner.mutation(api.domain.projects.create, { name: 'Two', summary: 'b' })
    await team.users.owner.mutation(api.domain.projects.create, { name: 'Three', summary: 'c' })

    await expect(
      team.users.owner.mutation(api.domain.projects.create, { name: 'Four', summary: 'd' }),
    ).rejects.toThrow('Plan limit reached')
  })

  it('allows more projects after upgrading to pro', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
      plan: 'free',
    })

    await team.users.owner.mutation(api.domain.projects.create, { name: 'One', summary: 'a' })
    await team.users.owner.mutation(api.domain.projects.create, { name: 'Two', summary: 'b' })
    await team.users.owner.mutation(api.domain.projects.create, { name: 'Three', summary: 'c' })
    await team.users.owner.mutation(api.domain.workspaces.upgradePlan, { plan: 'pro' })

    await expect(
      team.users.owner.mutation(api.domain.projects.create, { name: 'Four', summary: 'd' }),
    ).resolves.toBeDefined()
  })

  it('denies exportProjects on free plan and allows after upgrade', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
      plan: 'free',
    })

    await team.users.owner.mutation(api.domain.projects.create, { name: 'One', summary: 'a' })
    await expect(team.users.owner.query(api.domain.projects.exportProjects, {})).rejects.toThrow(
      'Forbidden: Export projects',
    )

    await team.users.owner.mutation(api.domain.workspaces.upgradePlan, { plan: 'pro' })
    await expect(team.users.owner.query(api.domain.projects.exportProjects, {})).resolves.toContain('One')
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

    const freeCtx = await free.users.owner.query(api.permissions.context.getPermissionContext, {})
    const proCtx = await pro.users.owner.query(api.permissions.context.getPermissionContext, {})

    expect(freeCtx?.can[saasPermissionKeys.workspaceExports]).toBe(false)
    expect(proCtx?.can[saasPermissionKeys.workspaceExports]).toBe(true)
  })
})
