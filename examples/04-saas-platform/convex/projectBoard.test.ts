/**
 * Why this file exists:
 * Example 04 should prove the server-integration workspace model directly: tenant isolation,
 * task/comment permissions, upload boundaries, and the internal webhook entrypoint.
 */
/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import { projectExport, taskCreate } from './auth/permissions'
import * as filesDomain from './domain/files'
import schema from './schema'
import { modules } from './test.setup'

function createCtx() {
  return createTestContext({ schema, modules })
}

describe('server integration workspace example', () => {
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

  it('blocks task creation in archived projects through cross-table resource checks', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
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
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: { owner: { role: 'owner' } },
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

  it('blocks cross-tenant by-id access for project and comment flows', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
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

    await expect(beta.users.owner.query(api.domain.projects.get, { id: projectId })).rejects.toThrow(
      'Document belongs to a different tenant.',
    )
    await expect(
      beta.users.owner.mutation(api.domain.comments.create, {
        taskId,
        body: 'Cross-tenant comment',
      }),
    ).rejects.toThrow('Document belongs to a different tenant.')
  })

  it('lists only members from the current workspace', async () => {
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

  it('creates webhook tasks through the internal mutation path', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })

    const projectId = await team.users.owner.mutation(api.domain.projects.create, {
      name: 'Webhook board',
      summary: 'Webhook demo',
    })

    await ctx.raw.mutation(internal.domain.webhooks.createTaskFromWebhook, {
      projectId,
      title: 'Created from webhook',
      priority: 'high',
    })

    const tasks = await team.users.owner.query(api.domain.tasks.listByProject, { projectId })
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.title).toBe('Created from webhook')
    expect(tasks[0]?.priority).toBe('high')
    expect(tasks[0]?.ownerId).toContain('webhook-bot:')
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

    const ownerCtx = await team.users.owner.query(api.permissions.context.getPermissionContext, {})
    const viewerCtx = await team.users.viewer.query(
      api.permissions.context.getPermissionContext,
      {},
    )

    expect(ownerCtx?.can[taskCreate.key]).toBe(true)
    expect(ownerCtx?.can[projectExport.key]).toBe(true)
    expect(viewerCtx?.can[taskCreate.key]).toBe(false)
    expect(viewerCtx?.can[projectExport.key]).toBe(false)
  })

  it('returns null context and rejects protected mutations for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(
      ctx.raw.query(api.permissions.context.getPermissionContext, {}),
    ).resolves.toBeNull()
    await expect(
      ctx.raw.mutation(api.domain.projects.create, {
        name: 'Anonymous project',
        summary: 'Should fail',
      }),
    ).rejects.toThrow('Forbidden: Create project')
  })
})
