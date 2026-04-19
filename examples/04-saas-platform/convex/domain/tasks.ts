import { can, deny, enforce, loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import { asyncMap } from 'convex-helpers'
import { v } from 'convex/values'

import {
  assignTask,
  taskPriorityValidator,
  taskStatusValidator,
  createTask,
  moveTask,
} from '../../shared/schemas/task'
import type { Doc } from '../_generated/dataModel'
import { taskCapabilities } from '../auth/capabilities'
import {
  canUpdateTask,
  hasRole,
  hasWorkspace,
  requireWorkspaceTenant,
} from '../auth/checks'
import { taskAssign, taskCreate, taskRead } from '../auth/permissions'
import { mutation, query } from '../functions'
import { removeTaskOp } from '../operations/tasks'

export const listByProject = query({
  args: { projectId: v.id('projects') },
  guard: taskRead,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    loadResource(actor, await ctx.db.get(args.projectId), 'Project')

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .collect()

    return taskCapabilities.attach(actor, tasks)
  },
})

export const get = query({
  args: { id: v.id('tasks') },
  guard: taskRead,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    const task = loadResource(actor, await ctx.db.get(args.id), 'Task')

    return taskCapabilities.attach(actor, task)
  },
})

export const create = mutation({
  args: createTask.args,
  guard: taskCreate,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const project = loadResource(
      actor,
      (await ctx.db.get(args.projectId)) as Doc<'projects'> | null,
      'Project',
    )

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
      workspaceId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId,
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
  args: moveTask.args,
  guard: taskRead,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const task = loadResource(actor, (await ctx.db.get(args.id)) as Doc<'tasks'> | null, 'Task')
    enforce(actor, 'Update task', canUpdateTask(task))

    const workspaceId = requireWorkspaceTenant(actor)
    const now = Date.now()
    await ctx.db.patch(args.id, { status: args.status, updatedAt: now })

    await ctx.db.insert('auditEvents', {
      workspaceId,
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
  args: assignTask.args,
  guard: taskAssign,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const task = loadResource(actor, (await ctx.db.get(args.id)) as Doc<'tasks'> | null, 'Task')

    if (args.assigneeId) {
      const assignee = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q) => q.eq('authId', args.assigneeId!))
        .first()
      if (!assignee || assignee.workspaceId !== workspaceId) {
        throw deny('Assignee must already belong to this workspace.')
      }
    }

    const now = Date.now()
    await ctx.db.patch(args.id, { assigneeId: args.assigneeId, updatedAt: now })

    await ctx.db.insert('auditEvents', {
      workspaceId,
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
  guard: hasWorkspace.and(hasRole('owner', 'admin', 'member')),
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const now = Date.now()
    const updates = await asyncMap(args.ids, async (id) => {
      const task = await ctx.db.get(id)
      const typedTask = task as Doc<'tasks'> | null
      if (!typedTask || typedTask.workspaceId !== workspaceId) {
        return { id, updated: false as const }
      }

      if (!can(actor, canUpdateTask(typedTask))) {
        return { id, updated: false as const }
      }

      await ctx.db.patch(id, { status: args.status, updatedAt: now })
      return { id, updated: true as const }
    })

    const results = {
      updated: updates.filter((entry) => entry.updated).length,
      skipped: updates.filter((entry) => !entry.updated).map((entry) => entry.id),
    }

    await ctx.db.insert('auditEvents', {
      workspaceId,
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

export const remove = mutation({
  ...removeTaskOp,
})

export const listForExport = query({
  args: { projectId: v.id('projects') },
  guard: taskRead,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    loadResource(actor, await ctx.db.get(args.projectId), 'Project')

    return ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .collect()
  },
})
