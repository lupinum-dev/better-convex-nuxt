import { can, deny, guard } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import {
  assignTask,
  taskPriorityValidator,
  taskStatusValidator,
  createTask,
  moveTask,
} from '../shared/schemas/task'
import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import {
  canAssignTask,
  canCreateTask,
  canDeleteTask,
  canReadTask,
  canUpdateTask,
  hasRole,
} from './auth/checks'
import { withCan } from './auth/resource'
import { loadResource } from './auth/scope'

export const listByProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    guard(actor, 'Read tasks', canReadTask)

    loadResource(actor, await ctx.db.get(args.projectId), 'Project')

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .collect()

    return tasks.map((task) =>
      withCan(task, {
        update: can(actor, canUpdateTask(task)),
        delete: can(actor, canDeleteTask(task)),
      }),
    )
  },
})

export const get = query({
  args: { id: v.id('tasks') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    guard(actor, 'Read task', canReadTask)

    const task = loadResource(actor, await ctx.db.get(args.id), 'Task')

    return withCan(task, {
      update: can(actor, canUpdateTask(task)),
      delete: can(actor, canDeleteTask(task)),
      assign: can(actor, canAssignTask),
    })
  },
})

export const create = mutation({
  args: createTask.convexValidators,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    guard(actor, 'Create task', canCreateTask)

    const project = loadResource(actor, await ctx.db.get(args.projectId), 'Project')

    if (project.status === 'archived') {
      throw deny('Cannot add tasks to archived projects.')
    }

    const now = Date.now()
    const taskId = await ctx.db.insert('tasks', {
      projectId: args.projectId,
      title: args.title,
      status: 'backlog',
      priority: args.priority ?? 'medium',
      ownerId: actor.userId,
      workspaceId: actor.tenantId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId: actor.tenantId,
      actorId: actor.userId,
      entityType: 'task',
      entityId: taskId,
      action: 'task.created',
      description: `Created task "${args.title}".`,
      createdAt: now,
    })

    return taskId
  },
})

export const moveToColumn = mutation({
  args: moveTask.convexValidators,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    const task = loadResource(actor, await ctx.db.get(args.id), 'Task')
    guard(actor, 'Update task', canUpdateTask(task))

    const now = Date.now()
    await ctx.db.patch(args.id, { status: args.status, updatedAt: now })

    await ctx.db.insert('auditEvents', {
      workspaceId: actor.tenantId,
      actorId: actor.userId,
      entityType: 'task',
      entityId: args.id,
      action: 'task.moved',
      description: `Moved "${task.title}" to ${args.status}.`,
      createdAt: now,
    })
  },
})

export const assign = mutation({
  args: assignTask.convexValidators,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    guard(actor, 'Assign task', canAssignTask)

    const task = loadResource(actor, await ctx.db.get(args.id), 'Task')

    if (args.assigneeId) {
      const assignee = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q) => q.eq('authId', args.assigneeId!))
        .first()
      if (!assignee || assignee.workspaceId !== actor.tenantId) {
        throw deny('Assignee must already belong to this workspace.')
      }
    }

    const now = Date.now()
    await ctx.db.patch(args.id, { assigneeId: args.assigneeId, updatedAt: now })

    await ctx.db.insert('auditEvents', {
      workspaceId: actor.tenantId,
      actorId: actor.userId,
      entityType: 'task',
      entityId: args.id,
      action: 'task.assigned',
      description: `Assigned "${task.title}" to ${args.assigneeId ?? 'nobody'}.`,
      createdAt: now,
    })
  },
})

export const bulkUpdateStatus = mutation({
  args: {
    ids: v.array(v.id('tasks')),
    status: taskStatusValidator,
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    guard(actor, 'Bulk update', hasRole('owner', 'admin', 'member'))

    const now = Date.now()
    const results = { updated: 0, skipped: [] as string[] }

    for (const id of args.ids) {
      const task = await ctx.db.get(id)
      if (!task || task.workspaceId !== actor.tenantId) {
        results.skipped.push(id)
        continue
      }

      if (!can(actor, canUpdateTask(task))) {
        results.skipped.push(id)
        continue
      }

      await ctx.db.patch(id, { status: args.status, updatedAt: now })
      results.updated++
    }

    await ctx.db.insert('auditEvents', {
      workspaceId: actor.tenantId,
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

export const listForExport = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    guard(actor, 'Read tasks', canReadTask)

    loadResource(actor, await ctx.db.get(args.projectId), 'Project')

    return ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .collect()
  },
})
