/**
 * Why this file exists:
 * This is the heart of Example 04. It demonstrates cross-table `resource` loading, business-state
 * `guard`s, optimistic board moves, bulk operations, and a server-friendly export query.
 */
import { v } from 'convex/values'

import {
  scopedMutation,
  scopedQuery,
} from './functions'
import {
  assignTask,
  createTask,
  moveTask,
  taskStatusValidator,
} from '../shared/schemas/task'

export const listByProject = scopedQuery({
  args: { projectId: v.id('projects') },
  require: 'task.read',
  resource: args => ({ table: 'projects', id: args.projectId }),
  handler: async ({ db }, args) => {
    return await db
      .query('tasks')
      .filter(q => q.eq(q.field('projectId'), args.projectId))
      .order('desc')
      .collect()
  },
})

export const get = scopedQuery({
  args: { id: v.id('tasks') },
  require: 'task.read',
  resource: args => args.id,
  handler: async ({ resource }) => {
    return resource ?? null
  },
})

export const create = scopedMutation({
  args: createTask.validators,
  require: 'task.create',
  // The primary resource is the parent project: load it, prove it belongs to this workspace,
  // then let the guard enforce project-specific business rules like "not archived".
  resource: args => ({ table: 'projects', id: args.projectId }),
  guard: ({ resource }) => {
    if (resource?.status === 'archived') {
      return 'Cannot add tasks to archived projects.'
    }
  },
  handler: async ({ db, actor }, args) => {
    const now = Date.now()
    const taskId = await db.insert('tasks', {
      projectId: args.projectId,
      title: args.title,
      status: 'backlog',
      priority: args.priority ?? 'medium',
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert('auditEvents', {
      actorId: actor.userId,
      entityType: 'task',
      entityId: String(taskId),
      action: 'task.created',
      description: `Created task "${args.title}".`,
      createdAt: now,
    })

    return taskId
  },
})

export const moveToColumn = scopedMutation({
  args: moveTask.validators,
  require: 'task.update',
  resource: args => args.id,
  handler: async ({ db, actor, resource }, args) => {
    const now = Date.now()
    await db.patch(args.id, {
      status: args.status,
      updatedAt: now,
    })

    await db.insert('auditEvents', {
      actorId: actor.userId,
      entityType: 'task',
      entityId: String(args.id),
      action: 'task.moved',
      description: `Moved "${resource?.title ?? 'task'}" to ${args.status}.`,
      createdAt: now,
    })
  },
})

export const assign = scopedMutation({
  args: assignTask.validators,
  require: 'task.assign',
  resource: args => args.id,
  guard: async ({ db }, args) => {
    if (!args.assigneeId) return

    const assignee = await db
      .query('users')
      .filter(q => q.eq(q.field('authId'), args.assigneeId))
      .first()

    if (!assignee) {
      return 'Assignee must already belong to this workspace.'
    }
  },
  handler: async ({ db, actor, resource }, args) => {
    const now = Date.now()
    await db.patch(args.id, {
      assigneeId: args.assigneeId,
      updatedAt: now,
    })

    await db.insert('auditEvents', {
      actorId: actor.userId,
      entityType: 'task',
      entityId: String(args.id),
      action: 'task.assigned',
      description:
        `Assigned "${resource?.title ?? 'task'}" to ${args.assigneeId ?? 'nobody'}.`,
      createdAt: now,
    })
  },
})

export const bulkUpdateStatus = scopedMutation({
  args: {
    ids: v.array(v.id('tasks')),
    status: taskStatusValidator,
  },
  require: 'task.update',
  handler: async ({ db, actor }, args) => {
    const now = Date.now()
    const results = {
      updated: 0,
      skipped: [] as string[],
    }

    for (const id of args.ids) {
      const task = await db.get(id)
      if (!task) {
        results.skipped.push(String(id))
        continue
      }

      if (actor.role === 'member' && task.ownerId !== actor.userId) {
        results.skipped.push(String(id))
        continue
      }

      await db.patch(id, {
        status: args.status,
        updatedAt: now,
      })
      results.updated++
    }

    await db.insert('auditEvents', {
      actorId: actor.userId,
      entityType: 'task',
      entityId: results.skipped.join(',') || 'bulk',
      action: 'task.bulk_status',
      description: `Bulk updated ${results.updated} task(s) to ${args.status}.`,
      createdAt: now,
    })

    return results
  },
})

export const listForExport = scopedQuery({
  args: { projectId: v.id('projects') },
  require: 'task.read',
  resource: args => ({ table: 'projects', id: args.projectId }),
  handler: async ({ db }, args) => {
    return await db
      .query('tasks')
      .filter(q => q.eq(q.field('projectId'), args.projectId))
      .order('desc')
      .collect()
  },
})
