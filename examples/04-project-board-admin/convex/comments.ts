import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

import { deny, guard } from 'better-convex-nuxt/auth'

import { canComment } from './auth/checks'
import { getActor } from './auth/actor'
import { ensureFound, ensureTenant } from './auth/scope'

export const listByTask = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Read comments', canComment)

    const task = await ctx.db.get(args.taskId)
    ensureFound(task, 'Task')
    ensureTenant(actor, task)

    return ctx.db
      .query('comments')
      .withIndex('by_task', q => q.eq('taskId', args.taskId))
      .order('asc')
      .collect()
  },
})

export const create = mutation({
  args: {
    taskId: v.id('tasks'),
    body: v.string(),
    attachmentStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Create comment', canComment)

    const task = await ctx.db.get(args.taskId)
    ensureFound(task, 'Task')
    ensureTenant(actor, task)

    const project = await ctx.db.get(task.projectId)
    ensureFound(project, 'Project')
    if (project.status === 'archived') {
      throw deny('Cannot comment on tasks in archived projects.')
    }

    const now = Date.now()
    const commentId = await ctx.db.insert('comments', {
      taskId: args.taskId,
      body: args.body,
      attachmentStorageId: args.attachmentStorageId,
      ownerId: actor!.userId,
      workspaceId: actor!.tenantId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId: actor!.tenantId,
      actorId: actor!.userId,
      entityType: 'comment',
      entityId: commentId,
      action: 'comment.created',
      description: 'Added a task comment.',
      createdAt: now,
    })

    return commentId
  },
})
