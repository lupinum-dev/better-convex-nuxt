import { deny, loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { createComment } from '../../../shared/features/comments/contract'
import type { Doc } from '../../_generated/dataModel'
import { requireWorkspaceTenant } from '../../auth/guards'
import { mutation, query } from '../../functions'
import { commentCreate } from './permissions'

export const listByTask = query.protected({
  args: { taskId: v.id('tasks') },
  guard: commentCreate,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    loadResource(appIdentity, (await ctx.db.get(args.taskId)) as Doc<'tasks'> | null, 'Task')

    return ctx.db
      .query('comments')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .order('asc')
      .collect()
  },
})

export const create = mutation.protected({
  args: createComment.args,
  guard: commentCreate,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const workspaceId = requireWorkspaceTenant(appIdentity)

    const task = loadResource(
      appIdentity,
      (await ctx.db.get(args.taskId)) as Doc<'tasks'> | null,
      'Task',
    )

    const project = loadResource(
      appIdentity,
      (await ctx.db.get(task.projectId)) as Doc<'projects'> | null,
      'Project',
    )
    if (project.status === 'archived') {
      throw deny('Cannot comment on tasks in archived projects.')
    }

    const now = Date.now()
    const commentId = await ctx.db.insert('comments', {
      taskId: args.taskId,
      body: args.body,
      attachmentStorageId: args.attachmentStorageId,
      ownerId: appIdentity.userId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: appIdentity.userId,
      entityType: 'comment',
      entityId: commentId,
      action: 'comment.created',
      description: 'Added a task comment.',
      createdAt: now,
    })

    return commentId
  },
})
