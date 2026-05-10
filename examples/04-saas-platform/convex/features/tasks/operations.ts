import { enforce, loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import { requireWorkspaceTenant } from '../../auth/guards'
import { query } from '../../functions'
import { canDeleteTask } from './checks'
import { taskRead } from './permissions'

export const removeTaskOp = defineOperation({
  id: 'tasks.remove',
  name: 'removeTask',
  kind: 'destructive',
  args: { id: v.id('tasks') },
  returns: v.null(),
  previewReturns: v.object({
    display: v.object({
      summary: v.string(),
      warn: v.string(),
      affects: v.object({
        tasks: v.number(),
        comments: v.number(),
      }),
    }),
    confirm: v.object({
      operation: v.literal('tasks.remove'),
      targetId: v.id('tasks'),
      affectedCounts: v.object({
        tasks: v.number(),
        comments: v.number(),
      }),
    }),
  }),
  guard: taskRead,
  load: async (ctx, args) => {
    const actor = await ctx.actor()
    const task = loadResource(actor, await ctx.db.get(args.id), 'Task')
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_task', (q: any) => q.eq('taskId', args.id))
      .collect()
    return { task, comments }
  },
  preview: async (_ctx, _args, { task, comments }) => ({
    display: {
      summary: `Will permanently delete "${task.title}".`,
      warn: 'This also removes all comments on the task.',
      affects: { tasks: 1, comments: comments.length },
    },
    confirm: {
      operation: 'tasks.remove',
      targetId: task._id,
      affectedCounts: { tasks: 1, comments: comments.length },
    },
  }),
  handler: async (ctx, args, { task, comments }) => {
    const actor = await ctx.actor()
    enforce(actor, 'Delete task', canDeleteTask(task))
    const workspaceId = requireWorkspaceTenant(actor)

    for (const comment of comments) {
      await ctx.db.delete(comment._id)
    }
    await ctx.db.delete(args.id)

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: actor.userId,
      entityType: 'task',
      entityId: args.id,
      action: 'task.deleted',
      description: `Deleted task "${task.title}".`,
      createdAt: Date.now(),
    })

    return null
  },
})

export const previewRemoveTask = query.protected(previewOf(removeTaskOp))
