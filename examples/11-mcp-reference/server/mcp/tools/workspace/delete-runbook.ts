import { defineTool } from '#convex/mcp'

import { api } from '~/convex/_generated/api'
import { deleteRunbook } from '~/shared/schemas/runbook'

export default defineTool({
  name: 'delete-runbook',
  schema: deleteRunbook,
  auth: 'required',
  scoped: true,
  group: 'workspace',
  check: actor => ['owner', 'admin', 'member'].includes(actor.role),
  destructive: true,
  preview: async (args, ctx) => {
    const runbook = await ctx.query(api.runbooks.get, { id: args.id })
    if (!runbook) {
      return ctx.blocked('Runbook not found.')
    }

    return ctx.preview({
      summary: `Will permanently delete "${runbook.title}".`,
      warn: 'This cannot be undone.',
      affects: { runbooks: 1 },
    })
  },
  handler: async (args, ctx) => {
    await ctx.mutation(api.runbooks.remove, args)
    return ctx.ok({ deleted: true, id: args.id }, 'Deleted runbook.')
  },
})
