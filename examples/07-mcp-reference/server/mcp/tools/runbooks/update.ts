import { api } from '#trellis/api'
import { runbookCreate } from '~/convex/features/runbooks/permissions'
import { updateRunbook } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

export default tool({
  schema: updateRunbook,
  call: api.features.runbooks.domain.update,
  permission: runbookCreate,
  group: 'workspace',
  middleware: async (args, ctx, next) => {
    if (
      args.title === undefined &&
      args.summary === undefined &&
      args.content === undefined &&
      args.visibility === undefined &&
      args.tags === undefined
    ) {
      return ctx.error('validation', 'Provide at least one field to update.')
    }

    const existing = await ctx.query(api.features.runbooks.domain.getWorkspace, { id: args.id })
    if (!existing) {
      return ctx.error('not_found', `Runbook "${args.id}" not found.`)
    }

    return await next()
  },
  meta: {
    name: 'update-runbook',
  },
})
