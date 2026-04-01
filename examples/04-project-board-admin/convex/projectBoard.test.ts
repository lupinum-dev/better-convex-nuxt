/**
 * Why this file exists:
 * Example 04 is meant to show real month-two patterns, not just UI polish.
 * These tests prove tenant isolation, guard behavior, bulk semantics, and service-auth parity.
 */
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

describe('project board example', () => {
  it('lets a member update their own task but not another member`s task', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        alice: { role: 'member' },
        bob: { role: 'member' },
      },
    })

    const projectId = await team.users.owner.mutation(api.projects.create, {
      name: 'Board',
      summary: 'Alpha board',
    })
    const taskId = await team.users.alice.mutation(api.tasks.create, {
      projectId,
      title: 'Alice task',
      priority: 'medium',
    })

    await team.users.alice.mutation(api.tasks.moveToColumn, {
      id: taskId,
      status: 'in_progress',
    })

    await expect(
      team.users.bob.mutation(api.tasks.moveToColumn, {
        id: taskId,
        status: 'done',
      }),
    ).rejects.toThrow('Forbidden: Update task')
  })

  it('lets viewers comment but blocks them from creating tasks', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const projectId = await team.users.owner.mutation(api.projects.create, {
      name: 'Board',
      summary: 'Alpha board',
    })
    const taskId = await team.users.owner.mutation(api.tasks.create, {
      projectId,
      title: 'Seed task',
      priority: 'medium',
    })

    await team.users.viewer.mutation(api.comments.create, {
      taskId,
      body: 'Viewer feedback',
    })

    await expect(
      team.users.viewer.mutation(api.tasks.create, {
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
      users: {
        owner: { role: 'owner' },
      },
    })

    const projectId = await team.users.owner.mutation(api.projects.create, {
      name: 'Archive me',
      summary: 'Soon frozen',
    })
    await team.users.owner.mutation(api.projects.archive, { id: projectId })

    await expect(
      team.users.owner.mutation(api.tasks.create, {
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
      users: {
        owner: { role: 'owner' },
      },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: {
        owner: { role: 'owner' },
      },
    })

    const alphaProject = await alpha.users.owner.mutation(api.projects.create, {
      name: 'Alpha board',
      summary: 'A',
    })
    const betaProject = await beta.users.owner.mutation(api.projects.create, {
      name: 'Beta board',
      summary: 'B',
    })

    await alpha.users.owner.mutation(api.tasks.create, {
      projectId: alphaProject,
      title: 'Alpha task',
      priority: 'medium',
    })
    await beta.users.owner.mutation(api.tasks.create, {
      projectId: betaProject,
      title: 'Beta task',
      priority: 'medium',
    })

    const alphaTasks = await alpha.users.owner.query(api.tasks.listByProject, { projectId: alphaProject })
    const betaTasks = await beta.users.owner.query(api.tasks.listByProject, { projectId: betaProject })

    expect(alphaTasks).toHaveLength(1)
    expect(alphaTasks[0]?.title).toBe('Alpha task')
    expect(betaTasks).toHaveLength(1)
    expect(betaTasks[0]?.title).toBe('Beta task')
  })

  it('returns resource not found when another workspace asks for a project by id', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: { owner: { role: 'owner' } },
    })

    const alphaProject = await alpha.users.owner.mutation(api.projects.create, {
      name: 'Alpha board',
      summary: 'A',
    })

    await expect(
      beta.users.owner.query(api.projects.get, { id: alphaProject }),
    ).rejects.toThrow('Resource not found.')
  })

  it('returns resource not found when another workspace tries to comment on a task by id', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: { owner: { role: 'owner' } },
    })

    const projectId = await alpha.users.owner.mutation(api.projects.create, {
      name: 'Alpha board',
      summary: 'A',
    })
    const taskId = await alpha.users.owner.mutation(api.tasks.create, {
      projectId,
      title: 'Alpha task',
      priority: 'medium',
    })

    await expect(
      beta.users.owner.mutation(api.comments.create, {
        taskId,
        body: 'Cross-tenant comment',
      }),
    ).rejects.toThrow('Resource not found.')
  })

  it('excludes users without a workspace from the scoped member list', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
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

    const members = await team.users.owner.query(api.members.list, {})

    expect(members).toHaveLength(2)
    expect(members.find(member => member.authId === 'floating-user')).toBeUndefined()
  })

  it('does not expose a raw storage-url query anymore', async () => {
    const ctx = createCtx()

    await expect(
      ctx.raw.query(api.files.getUrl, {} as never),
    ).rejects.toThrow(/getUrl|Could not find|not found/)
  })

  it('bulk updates only the member-owned tasks and reports skipped ids', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        alice: { role: 'member' },
        bob: { role: 'member' },
      },
    })

    const projectId = await team.users.owner.mutation(api.projects.create, {
      name: 'Board',
      summary: 'Bulk demo',
    })
    const aliceTask = await team.users.alice.mutation(api.tasks.create, {
      projectId,
      title: 'Alice task',
      priority: 'medium',
    })
    const bobTask = await team.users.bob.mutation(api.tasks.create, {
      projectId,
      title: 'Bob task',
      priority: 'medium',
    })

    const result = await team.users.alice.mutation(api.tasks.bulkUpdateStatus, {
      ids: [aliceTask, bobTask],
      status: 'done',
    })

    expect(result.updated).toBe(1)
    expect(result.skipped).toHaveLength(1)
  })

  it('service-auth callers obey the same permission rules as browser users', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const projectId = await team.users.owner.mutation(api.projects.create, {
      name: 'Board',
      summary: 'Service auth',
    })

    const service = ctx.asService({
      userId: team.users.viewer.authId,
      role: 'viewer',
      tenantId: team.id,
    })

    await expect(
      service.mutation(api.tasks.create, {
        projectId,
        title: 'Nope',
        priority: 'medium',
      }),
    ).rejects.toThrow('Forbidden: Create task')
  })

  it('role changes update the permission context and block future mutations', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        member: { role: 'member' },
      },
    })

    const projectId = await team.users.owner.mutation(api.projects.create, {
      name: 'Board',
      summary: 'Role flip',
    })

    const before = await team.users.member.query(api.workspaces.getPermissionContext, {})
    expect(before?.role).toBe('member')

    await team.users.owner.mutation(api.members.changeRole, {
      userId: team.users.member.id as never,
      newRole: 'viewer',
    })

    const after = await team.users.member.query(api.workspaces.getPermissionContext, {})
    expect(after?.role).toBe('viewer')

    await expect(
      team.users.member.mutation(api.tasks.create, {
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
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.workspaces.getPermissionContext, {})
    const viewerCtx = await team.users.viewer.query(api.workspaces.getPermissionContext, {})

    expect(ownerCtx?.can['task.create']).toBe(true)
    expect(ownerCtx?.can['workspace.members']).toBe(true)
    expect(viewerCtx?.can['task.create']).toBe(false)
    expect(viewerCtx?.can['workspace.members']).toBe(false)
  })

  it('returns null context and rejects protected mutations for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.workspaces.getPermissionContext, {})).resolves.toBeNull()
    await expect(
      ctx.raw.mutation(api.projects.create, {
        name: 'Anonymous project',
        summary: 'Should fail',
      }),
    ).rejects.toThrow('Forbidden: Create project')
  })
})
