import { v } from 'convex/values'

import { operationPreview } from '../../../../../../src/runtime/functions/define-operation'
import { deleteProjectDescriptor } from '../../../shared/features/projects/operations'
import { createProjectArgs } from '../../../shared/features/projects/tools'
import { mutation, query } from '../../_generated/server'

export const previewDeleteProject = query({
  args: deleteProjectDescriptor.args,
  returns: deleteProjectDescriptor.previewReturns,
  handler: async (_ctx, args) =>
    operationPreview({
      summary: `Delete project ${args.id}`,
      confirm: {
        id: args.id,
      },
    }),
})

export const deleteProject = mutation({
  args: deleteProjectDescriptor.args,
  returns: deleteProjectDescriptor.returns,
  handler: async () => ({
    deleted: true,
  }),
})

export const createProject = mutation({
  args: createProjectArgs.args,
  returns: v.object({
    id: v.string(),
    title: v.string(),
  }),
  handler: async (_ctx, args) => ({
    id: `project:${args.title}`,
    title: args.title,
  }),
})
