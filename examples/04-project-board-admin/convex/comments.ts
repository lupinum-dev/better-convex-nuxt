/**
 * Why this file exists:
 * Comments prove nested authorization plus uploads. The task is the primary resource, then the
 * guard walks up to the parent project to enforce business state.
 */
import { v } from 'convex/values'

import {
  scopedMutation,
  scopedQuery,
} from './functions'
import { createComment } from '../shared/schemas/comment'

export const listByTask = scopedQuery({
  args: { taskId: v.id('tasks') },
  require: 'comment.read',
  resource: args => ({ table: 'tasks', id: args.taskId }),
  // Loading the parent task here proves it exists and belongs to this workspace before the
  // handler queries child comments.
  handler: async ({ db }, args) => {
    return await db
      .query('comments')
      .filter(q => q.eq(q.field('taskId'), args.taskId))
      .order('asc')
      .collect()
  },
})

export const create = scopedMutation({
  args: createComment.validators,
  require: 'comment.create',
  resource: args => ({ table: 'tasks', id: args.taskId }),
  guard: async ({ db, resource: task }) => {
    const project = await db.get(task.projectId)
    if (!project) {
      return 'Parent project not found.'
    }
    if (project.status === 'archived') {
      return 'Cannot comment on tasks in archived projects.'
    }
  },
  handler: async ({ db, actor }, args) => {
    const now = Date.now()
    const commentId = await db.insert('comments', {
      taskId: args.taskId,
      body: args.body,
      attachmentStorageId: args.attachmentStorageId,
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert('auditEvents', {
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
