import { can, deny, enforce, loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import { asyncMap } from 'convex-helpers'
import { v } from 'convex/values'

import {
  assignTask,
  createTask,
  moveTask,
  taskStatusValidator,
} from '../../../shared/features/tasks/contract'
import type { Doc } from '../../_generated/dataModel'
import { hasRole, hasWorkspace, requireWorkspaceTenant } from '../../auth/guards'
import { mutation, query } from '../../functions'
import { canUpdateTask } from './checks'
import { removeTaskOp } from './operations'
import { taskAssign, taskCreate, taskRead } from './permissions'
import { taskCapabilities } from './recordAccess'

export const listByProject = query.protected({
  args: { projectId: v.id('projects') },
  guard: taskRead,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    loadResource(appIdentity, await ctx.db.get(args.projectId), 'Project')

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .collect()

    return taskCapabilities.attach(appIdentity, tasks)
  },
})

export const get = query.protected({
  args: { id: v.id('tasks') },
  guard: taskRead,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const task = loadResource(
      appIdentity,
      (await ctx.db.get(args.id)) as Doc<'tasks'> | null,
      'Task',
    )
    return taskCapabilities.attach(appIdentity, task)
  },
})

export const create = mutation.protected({
  args: createTask.args,
  guard: taskCreate,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const workspaceId = requireWorkspaceTenant(appIdentity)

    const project = loadResource(
      appIdentity,
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
      ownerId: appIdentity.userId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: appIdentity.userId,
      entityType: 'task',
      entityId: taskId,
      action: 'task.created',
      description: `Created task "${args.title}".`,
      createdAt: now,
    })

    return taskId
  },
})

export const moveToColumn = mutation.protected({
  args: moveTask.args,
  guard: taskRead,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const task = loadResource(
      appIdentity,
      (await ctx.db.get(args.id)) as Doc<'tasks'> | null,
      'Task',
    )
    enforce(appIdentity, 'Update task', canUpdateTask(task))

    const workspaceId = requireWorkspaceTenant(appIdentity)
    const now = Date.now()
    await ctx.db.patch(args.id, { status: args.status, updatedAt: now })

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: appIdentity.userId,
      entityType: 'task',
      entityId: args.id,
      action: 'task.moved',
      description: `Moved "${task.title}" to ${args.status}.`,
      createdAt: now,
    })
  },
})

export const assign = mutation.protected({
  args: assignTask.args,
  guard: taskAssign,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const workspaceId = requireWorkspaceTenant(appIdentity)

    const task = loadResource(
      appIdentity,
      (await ctx.db.get(args.id)) as Doc<'tasks'> | null,
      'Task',
    )

    if (args.assigneeId) {
      const assignee = await ctx.db.get(args.assigneeId)
      if (!assignee || assignee.workspaceId !== workspaceId) {
        throw deny('Assignee must already belong to this workspace.')
      }
    }

    const now = Date.now()
    await ctx.db.patch(args.id, { assigneeId: args.assigneeId, updatedAt: now })

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: appIdentity.userId,
      entityType: 'task',
      entityId: args.id,
      action: 'task.assigned',
      description: `Assigned "${task.title}" to ${args.assigneeId ?? 'nobody'}.`,
      createdAt: now,
    })
  },
})

export const bulkUpdateStatus = mutation.protected({
  args: {
    ids: v.array(v.id('tasks')),
    status: taskStatusValidator,
  },
  guard: hasWorkspace.and(hasRole('owner', 'admin', 'member')),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const workspaceId = requireWorkspaceTenant(appIdentity)

    const now = Date.now()
    const updates = await asyncMap(args.ids, async (id) => {
      const task = await ctx.db.get(id)
      const typedTask = task as Doc<'tasks'> | null
      if (!typedTask || typedTask.workspaceId !== workspaceId) {
        return { id, updated: false as const }
      }

      if (!can(appIdentity, canUpdateTask(typedTask))) {
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
      actorId: appIdentity.userId,
      entityType: 'task',
      entityId: results.skipped.join(',') || 'bulk',
      action: 'task.bulk_status',
      description: `Bulk updated ${results.updated} task(s) to ${args.status}.`,
      createdAt: now,
    })

    return results
  },
})

export const remove = mutation.protected({
  ...removeTaskOp,
})

export const listForExport = query.protected({
  args: { projectId: v.id('projects') },
  guard: taskRead,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    loadResource(appIdentity, await ctx.db.get(args.projectId), 'Project')

    return ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .collect()
  },
})
