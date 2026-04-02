import { deny, enforce } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { createComment } from '../shared/schemas/comment'
import { canComment } from './auth/checks'
import { loadResource } from './auth/scope'
import { appMutation, appQuery } from './functions'

export const listByTask = appQuery({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Read comments', canComment)

    loadResource(actor, await ctx.db.get(args.taskId), 'Task')

    return ctx.db
      .query('comments')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .order('asc')
      .collect()
  },
})

export const create = appMutation({
  args: createComment.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Create comment', canComment)

    const task = loadResource(actor, await ctx.db.get(args.taskId), 'Task')

    const project = loadResource(actor, await ctx.db.get(task.projectId), 'Project')
    if (project.status === 'archived') {
      throw deny('Cannot comment on tasks in archived projects.')
    }

    const now = Date.now()
    const commentId = await ctx.db.insert('comments', {
      taskId: args.taskId,
      body: args.body,
      attachmentStorageId: args.attachmentStorageId,
      ownerId: actor.userId,
      workspaceId: actor.tenantId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId: actor.tenantId,
      actorId: actor.userId,
      entityType: 'comment',
      entityId: commentId,
      action: 'comment.created',
      description: 'Added a task comment.',
      createdAt: now,
    })

    return commentId
  },
})
