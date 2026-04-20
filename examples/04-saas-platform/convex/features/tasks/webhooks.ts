/**
 * Why this file exists:
 * Example 04 keeps one narrow verified-route-to-internal-mutation path to show how a Nitro route
 * can validate external input before handing work to Convex. The route stays server-owned; it no
 * longer bootstraps or impersonates a synthetic webhook bot user.
 */
import { deny } from '@lupinum/trellis/auth'

import { createTaskFromWebhook } from '../../../shared/features/tasks/contract'
import type { Doc } from '../../_generated/dataModel'
import { internalMutation } from '../../_generated/server'

export const createTaskFromWebhookMutation = internalMutation({
  args: createTaskFromWebhook.args,
  handler: async (ctx, args) => {
    const project = (await ctx.db.get(args.projectId)) as Doc<'projects'> | null
    if (!project) {
      throw deny('Project not found.')
    }

    if (project.status === 'archived') {
      throw deny('Cannot add tasks to archived projects.')
    }

    const now = Date.now()
    const ownerId = project.ownerId

    const taskId = await ctx.db.insert('tasks', {
      projectId: args.projectId,
      title: args.title,
      status: 'backlog',
      priority: args.priority ?? 'medium',
      ownerId,
      workspaceId: project.workspaceId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId: project.workspaceId,
      actorId: ownerId,
      entityType: 'task',
      entityId: taskId,
      action: 'task.webhook_created',
      description: `Created task "${args.title}" from verified webhook route.`,
      createdAt: now,
    })

    return taskId
  },
})
