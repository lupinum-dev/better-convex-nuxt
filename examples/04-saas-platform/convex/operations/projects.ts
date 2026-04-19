import { deny, requireRecord } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { archiveProject } from '../../shared/schemas/project'
import { canArchiveProject, requireWorkspaceTenant } from '../auth/checks'
import { query } from '../functions'

export const archiveProjectOp = defineOperation({
  id: 'projects.archive',
  name: 'archiveProject',
  kind: 'destructive',
  args: archiveProject.args,
  returns: v.null(),
  previewReturns: v.object({
    display: v.object({
      summary: v.string(),
      warn: v.string(),
      affects: v.object({
        projects: v.number(),
      }),
    }),
    confirm: v.object({
      operation: v.literal('projects.archive'),
      targetId: v.id('projects'),
      affectedCounts: v.object({
        projects: v.number(),
      }),
    }),
  }),
  guard: canArchiveProject as never,
  load: async (ctx, args) => {
    const project = await ctx.db.get(args.id)
    requireRecord(project, 'Project')
    return { project }
  },
  preview: async (_ctx, _args, { project }) => ({
    display: {
      summary: `Will archive "${project.name}".`,
      warn: 'Archived projects stop accepting new tasks.',
      affects: { projects: 1 },
    },
    confirm: {
      operation: 'projects.archive',
      targetId: project._id,
      affectedCounts: { projects: 1 },
    },
  }),
  handler: async (ctx, args, { project }) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    if (project.status === 'archived') throw deny('Project is already archived.')

    const now = Date.now()
    await ctx.db.patch(args.id, {
      status: 'archived',
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: actor.userId,
      entityType: 'project',
      entityId: args.id,
      action: 'project.archived',
      description: `Archived "${project.name}".`,
      createdAt: now,
    })

    return null
  },
})

export const previewArchiveProject = query(previewOf(archiveProjectOp))
