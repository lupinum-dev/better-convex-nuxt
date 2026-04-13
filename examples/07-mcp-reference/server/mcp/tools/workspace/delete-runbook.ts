import { api } from '#trellis/api'
import { defineTool } from '#trellis/mcp'
import { deleteRunbook } from '~/shared/schemas/runbook'

export default defineTool({
  name: 'delete-runbook',
  schema: deleteRunbook,
  auth: 'required',
  scoped: true,
  group: 'workspace',
  check: (actor) => !!actor && ['owner', 'admin', 'member'].includes(actor.role),
  destructive: true,
  preview: async (args, ctx) => {
    const runbook = await ctx.query(api.runbooks.getWorkspace, { id: args.id })
    if (!runbook) {
      return ctx.blocked('Runbook not found.')
    }
    if (!runbook._can?.delete) {
      return ctx.blocked('You do not have permission to delete this runbook.')
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
