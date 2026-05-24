import { enforce, loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import {
  defineOperation,
  operationEffect,
  operationIssue,
  operationPreview,
  operationPreviewValidator,
  previewOf,
} from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import { requireWorkspaceTenant } from '../../auth/guards'
import { mutation } from '../../functions'
import { canDeleteTask } from './checks'
import { taskRead } from './permissions'

export const removeTaskOp = defineOperation({
  id: 'tasks.remove',
  name: 'removeTask',
  kind: 'destructive',
  identityForwardingFunctionRef: 'features/tasks/domain:remove',
  args: { id: v.id('tasks') },
  returns: v.null(),
  previewReturns: operationPreviewValidator({
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
    const appIdentity = await ctx.appIdentity()
    const task = loadResource(appIdentity, await ctx.db.get(args.id), 'Task')
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_task', (q: any) => q.eq('taskId', args.id))
      .collect()
    return { task, comments }
  },
  preview: async (_ctx, _args, { task, comments }) =>
    operationPreview({
      summary: `Will permanently delete "${task.title}".`,
      warnings: [
        operationIssue({
          code: 'delete-comments',
          message: 'This also removes all comments on the task.',
        }),
      ],
      effects: [
        operationEffect({ kind: 'tasks', summary: 'Tasks deleted', count: 1 }),
        operationEffect({ kind: 'comments', summary: 'Comments deleted', count: comments.length }),
      ],
      confirm: {
        operation: 'tasks.remove',
        targetId: task._id,
        affectedCounts: { tasks: 1, comments: comments.length },
      },
    }),
  handler: async (ctx, args, { task, comments }) => {
    const appIdentity = await ctx.appIdentity()
    enforce(appIdentity, 'Delete task', canDeleteTask(task))
    const workspaceId = requireWorkspaceTenant(appIdentity)

    for (const comment of comments) {
      await ctx.db.delete(comment._id)
    }
    await ctx.db.delete(args.id)

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: appIdentity.userId,
      entityType: 'task',
      entityId: args.id,
      action: 'task.deleted',
      description: `Deleted task "${task.title}".`,
      createdAt: Date.now(),
    })

    return null
  },
})

export const previewRemoveTask = mutation.protected(previewOf(removeTaskOp))
