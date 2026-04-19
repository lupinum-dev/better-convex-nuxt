/**
 * Why this file exists:
 * Verified Nitro routes often need a narrow internal Convex entrypoint instead of pretending to
 * be a browser user. This mutation is that explicit server-only path.
 */
import { deny } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { internalMutation } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { ensureWebhookBotUser } from '../auth/webhookBot'

export const createTaskFromWebhook = internalMutation({
  args: {
    projectId: v.id('projects'),
    title: v.string(),
    priority: v.optional(v.union(v.literal('low'), v.literal('medium'), v.literal('high'))),
  },
  handler: async (ctx, args) => {
    const project = (await ctx.db.get(args.projectId)) as Doc<'projects'> | null
    if (!project) {
      throw deny('Project not found.')
    }

    if (project.status === 'archived') {
      throw deny('Cannot add tasks to archived projects.')
    }

    const now = Date.now()
    const ownerId = await ensureWebhookBotUser(ctx, project.workspaceId, now)

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
      description: `Created task "${args.title}" from webhook.`,
      createdAt: now,
    })

    return taskId
  },
})
