import { deleteProjectDescriptor } from '../../../shared/features/projects/operations'
import { mutation, query } from '../../_generated/server'

export const previewDeleteProject = query({
  args: deleteProjectDescriptor.args,
  returns: deleteProjectDescriptor.previewReturns,
  handler: async (_ctx, args) => ({
    display: {
      summary: `Delete project ${args.id}`,
    },
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
