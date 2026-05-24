import { deny, requireRecord } from '@lupinum/trellis/auth'
import {
  defineOperation,
  operationEffect,
  operationIssue,
  operationPreview,
  operationPreviewValidator,
  previewOf,
} from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import { archiveProject } from '../../../shared/features/projects/contract'
import { requireWorkspaceTenant } from '../../auth/guards'
import { mutation } from '../../functions'
import { projectArchive } from './permissions'

export const archiveProjectOp = defineOperation({
  id: 'projects.archive',
  name: 'archiveProject',
  kind: 'destructive',
  identityForwardingFunctionRef: 'features/projects/domain:archive',
  args: archiveProject.args,
  returns: v.null(),
  previewReturns: operationPreviewValidator({
    confirm: v.object({
      operation: v.literal('projects.archive'),
      targetId: v.id('projects'),
      affectedCounts: v.object({
        projects: v.number(),
      }),
    }),
  }),
  guard: projectArchive,
  load: async (ctx, args) => {
    const project = await ctx.db.get(args.id)
    requireRecord(project, 'Project')
    return { project }
  },
  preview: async (_ctx, _args, { project }) =>
    operationPreview({
      summary: `Will archive "${project.name}".`,
      warnings: [
        operationIssue({
          code: 'archive-project',
          message: 'Archived projects stop accepting new tasks.',
        }),
      ],
      effects: [operationEffect({ kind: 'projects', summary: 'Projects archived', count: 1 })],
      confirm: {
        operation: 'projects.archive',
        targetId: project._id,
        affectedCounts: { projects: 1 },
      },
    }),
  handler: async (ctx, args, { project }) => {
    const appIdentity = await ctx.appIdentity()
    const workspaceId = requireWorkspaceTenant(appIdentity)

    if (project.status === 'archived') throw deny('Project is already archived.')

    const now = Date.now()
    await ctx.db.patch(args.id, {
      status: 'archived',
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: appIdentity.userId,
      entityType: 'project',
      entityId: args.id,
      action: 'project.archived',
      description: `Archived "${project.name}".`,
      createdAt: now,
    })

    return null
  },
})

export const previewArchiveProject = mutation.protected(previewOf(archiveProjectOp))
