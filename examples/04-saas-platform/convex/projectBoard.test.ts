/**
 * Why this file exists:
 * Example 04 should prove the server-integration workspace model directly: isolation,
 * task/comment permissions, upload boundaries, and the internal webhook entrypoint.
 */
/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import type { FunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { commentCreate } from './features/comments'
import * as filesDomain from './features/files'
import { projectExport } from './features/projects'
import { taskCreate } from './features/tasks'
import schema from './schema'
import { modules } from './test.setup'

function createCtx() {
  return createTestContext({ schema, modules })
}

const archiveProjectMutation = api.features.projects.domain.archive as FunctionReference<
  'mutation',
  'public',
  { id: Id<'projects'>; _confirmationToken: string },
  null
>

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

    const projectId = await team.users.owner.mutation(api.features.projects.domain.create, {
      name: 'Board',
      summary: 'Alpha board',
    })
    const taskId = await team.users.alice.mutation(api.features.tasks.domain.create, {
      projectId,
      title: 'Alice task',
      priority: 'medium',
    })

    await team.users.alice.mutation(api.features.tasks.domain.moveToColumn, {
      id: taskId,
      status: 'in_progress',
    })

    await expect(
      team.users.bob.mutation(api.features.tasks.domain.moveToColumn, {
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

    const projectId = await team.users.owner.mutation(api.features.projects.domain.create, {
      name: 'Board',
      summary: 'Alpha board',
    })
    const taskId = await team.users.owner.mutation(api.features.tasks.domain.create, {
      projectId,
      title: 'Seed task',
      priority: 'medium',
    })

    await team.users.viewer.mutation(api.features.comments.domain.create, {
      taskId,
      body: 'Viewer feedback',
    })

    await expect(
      team.users.viewer.mutation(api.features.tasks.domain.create, {
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

    const projectId = await team.users.owner.mutation(api.features.projects.domain.create, {
      name: 'Archive me',
      summary: 'Soon frozen',
    })
    const archiveArgs = { id: projectId }
    const archivePreview = await team.users.owner.mutation(
      api.features.projects.operations.previewArchiveProject,
      archiveArgs,
    )
    await team.users.owner.mutation(archiveProjectMutation, {
      ...archiveArgs,
      _confirmationToken: archivePreview.confirmation!.token,
    })

    await expect(
      team.users.owner.mutation(api.features.tasks.domain.create, {
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

    const alphaProject = await alpha.users.owner.mutation(api.features.projects.domain.create, {
      name: 'Alpha board',
      summary: 'A',
    })
    const betaProject = await beta.users.owner.mutation(api.features.projects.domain.create, {
      name: 'Beta board',
      summary: 'B',
    })

    await alpha.users.owner.mutation(api.features.tasks.domain.create, {
      projectId: alphaProject,
      title: 'Alpha task',
      priority: 'medium',
    })
    await beta.users.owner.mutation(api.features.tasks.domain.create, {
      projectId: betaProject,
      title: 'Beta task',
      priority: 'medium',
    })

    const alphaTasks = await alpha.users.owner.query(api.features.tasks.domain.listByProject, {
      projectId: alphaProject,
    })
    const betaTasks = await beta.users.owner.query(api.features.tasks.domain.listByProject, {
      projectId: betaProject,
    })

    expect(alphaTasks).toHaveLength(1)
    expect(alphaTasks[0]?.title).toBe('Alpha task')
    expect(betaTasks).toHaveLength(1)
    expect(betaTasks[0]?.title).toBe('Beta task')
  })

  it('blocks cross-scope by-id access for project and comment flows', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: { owner: { role: 'owner' } },
    })

    const projectId = await alpha.users.owner.mutation(api.features.projects.domain.create, {
      name: 'Alpha board',
      summary: 'A',
    })
    const taskId = await alpha.users.owner.mutation(api.features.tasks.domain.create, {
      projectId,
      title: 'Alpha task',
      priority: 'medium',
    })

    await expect(
      beta.users.owner.query(api.features.projects.domain.get, { id: projectId }),
    ).rejects.toThrow('Document belongs to a different isolation scope.')
    await expect(
      beta.users.owner.mutation(api.features.comments.domain.create, {
        taskId,
        body: 'Cross-scope comment',
      }),
    ).rejects.toThrow('Document belongs to a different isolation scope.')
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
      authKey: 'floating-user',
      email: 'floating-user@example.test',
      displayName: 'Floating User',
      role: 'viewer',
      workspaceId: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const members = await team.users.owner.query(api.features.members.domain.list, {})

    expect(members).toHaveLength(2)
    expect(
      members.find((member: (typeof members)[number]) => member.authKey === 'floating-user'),
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

    const projectId = await team.users.owner.mutation(api.features.projects.domain.create, {
      name: 'Board',
      summary: 'Bulk demo',
    })
    const aliceTask = await team.users.alice.mutation(api.features.tasks.domain.create, {
      projectId,
      title: 'Alice task',
      priority: 'medium',
    })
    const bobTask = await team.users.bob.mutation(api.features.tasks.domain.create, {
      projectId,
      title: 'Bob task',
      priority: 'medium',
    })

    const result = await team.users.alice.mutation(api.features.tasks.domain.bulkUpdateStatus, {
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

    const projectId = await team.users.owner.mutation(api.features.projects.domain.create, {
      name: 'Webhook board',
      summary: 'Webhook demo',
    })

    await ctx.raw.mutation(internal.features.tasks.webhooks.createTaskFromWebhookMutation, {
      projectId,
      title: 'Created from webhook',
      priority: 'high',
    })

    const tasks = await team.users.owner.query(api.features.tasks.domain.listByProject, {
      projectId,
    })
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.title).toBe('Created from webhook')
    expect(tasks[0]?.priority).toBe('high')
    expect(tasks[0]?.ownerId).toBe(team.users.owner.id)
  })

  it('returns access context booleans for owners and viewers', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.permissions.context.getAccessContext, {})
    const viewerCtx = await team.users.viewer.query(api.permissions.context.getAccessContext, {})

    expect(ownerCtx?.can[taskCreate.key]).toBe(true)
    expect(ownerCtx?.can[projectExport.key]).toBe(true)
    expect(viewerCtx?.can[taskCreate.key]).toBe(false)
    expect(viewerCtx?.can[projectExport.key]).toBe(false)
    expect(ownerCtx?.can[commentCreate.key]).toBe(true)
  })

  it('returns null context and rejects protected mutations for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.permissions.context.getAccessContext, {})).resolves.toBeNull()
    await expect(
      ctx.raw.mutation(api.features.projects.domain.create, {
        name: 'Anonymous project',
        summary: 'Should fail',
      }),
    ).rejects.toThrow('Forbidden: Create project')
  })
})
