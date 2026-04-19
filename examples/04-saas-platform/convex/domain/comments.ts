import { deny, enforce, loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { createComment } from '../../shared/schemas/comment'
import { canComment, requireWorkspaceTenant } from '../auth/checks'
import { mutation, query } from '../functions'

export const listByTask = query({
  args: { taskId: v.id('tasks') },
  guard: canComment,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    loadResource(actor, await ctx.db.get(args.taskId), 'Task')

    return ctx.db
      .query('comments')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .order('asc')
      .collect()
  },
})

export const create = mutation({
  args: createComment.args,
  guard: canComment,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

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
      workspaceId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId,
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
