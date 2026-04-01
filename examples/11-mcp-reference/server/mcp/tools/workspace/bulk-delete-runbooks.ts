import { defineTool } from '#convex/mcp'

import { api } from '~/convex/_generated/api'
import { bulkDeleteRunbooks } from '~/shared/schemas/runbook'

export default defineTool({
  name: 'bulk-delete-runbooks',
  schema: bulkDeleteRunbooks,
  auth: 'required',
  scoped: true,
  group: 'workspace',
  tags: ['bulk', 'dangerous'],
  check: actor => ['owner', 'admin'].includes(actor.role),
  destructive: true,
  rateLimit: { max: 5, window: '1m' },
  maxItems: { field: 'ids', limit: 10 },
  middleware: async (args, ctx, next) => {
    console.log(`[mcp] bulk-delete-runbooks actor=${ctx.actor?.userId} count=${args.ids.length}`)
    return await next()
  },
  preview: async (args, ctx) => {
    const runbooks = await Promise.all(args.ids.map(id => ctx.query(api.runbooks.get, { id })))
    const found = runbooks.filter(Boolean)

    if (found.length === 0) {
      return ctx.blocked('None of the selected runbooks exist.')
    }

    return ctx.preview({
      summary: `Will delete ${found.length} runbook${found.length === 1 ? '' : 's'}: ${found.map(runbook => `"${runbook!.title}"`).join(', ')}`,
      warn: found.length !== args.ids.length ? 'Some ids were missing and will be skipped.' : undefined,
      affects: { runbooks: found.length },
    })
  },
  handler: async (args, ctx) => {
    const result = await ctx.mutation(api.runbooks.bulkRemove, args)
    return ctx.ok(result, `Deleted ${result.deleted} runbook${result.deleted === 1 ? '' : 's'}.`)
  },
})
