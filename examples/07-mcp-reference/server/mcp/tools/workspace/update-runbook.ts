import { api } from '#trellis/api'
import { runbookCreate } from '~/convex/auth/permissions'
import { updateRunbook } from '~/shared/schemas/runbook'

import { tool } from '../../runtime'

export default tool({
  schema: updateRunbook,
  call: api.domain.runbooks.update,
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

    const existing = await ctx.query(api.domain.runbooks.getWorkspace, { id: args.id })
    if (!existing) {
      return ctx.error('not_found', `Runbook "${args.id}" not found.`)
    }

    return await next()
  },
  meta: {
    name: 'update-runbook',
  },
})
