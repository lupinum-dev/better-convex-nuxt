import { defineTool } from '#trellis/mcp'
import { api } from '#trellis/api'
import { updateRunbook } from '~/shared/schemas/runbook'

export default defineTool({
  name: 'update-runbook',
  schema: updateRunbook,
  auth: 'required',
  scoped: true,
  group: 'workspace',
  check: (actor) => !!actor && ['owner', 'admin', 'member'].includes(actor.role),
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

    const existing = await ctx.query(api.runbooks.get, { id: args.id })
    if (!existing) {
      return ctx.error('not_found', `Runbook "${args.id}" not found.`)
    }

    return await next()
  },
  handler: async (args, ctx) => {
    await ctx.mutation(api.runbooks.update, args)
    return ctx.ok({ updated: true, id: args.id }, 'Updated runbook.')
  },
})
