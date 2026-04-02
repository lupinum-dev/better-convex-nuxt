import { defineTool } from '#trellis/mcp'
import { api } from '#trellis/api'
import { createRunbook } from '~/shared/schemas/runbook'

export default defineTool({
  name: 'create-runbook',
  schema: createRunbook,
  auth: 'required',
  scoped: true,
  group: 'workspace',
  check: (actor) => !!actor && ['owner', 'admin', 'member'].includes(actor.role),
  maxItems: { field: 'tags', limit: 6 },
  middleware: async (args, ctx, next) => {
    if (!args.content.trim().startsWith('# ')) {
      return ctx.error('validation', 'Runbook content must start with a markdown heading.')
    }
    return await next()
  },
  handler: async (args, ctx) => {
    const id = await ctx.mutation(api.runbooks.create, args)
    return ctx.ok({ id }, `Created runbook "${args.title}".`)
  },
})
