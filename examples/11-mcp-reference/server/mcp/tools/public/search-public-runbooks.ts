import { defineTool } from '#convex/mcp'

import { api } from '~/convex/_generated/api'
import { searchRunbooks } from '~/shared/schemas/runbook'

export default defineTool({
  name: 'search-public-runbooks',
  schema: searchRunbooks,
  group: 'public',
  tags: ['search', 'public'],
  operation: 'query',
  rateLimit: { max: 20, window: '1m' },
  middleware: async (args, ctx, next) => {
    if (args.term.trim().length < 2) {
      return ctx.error('validation', 'Search term must be at least 2 characters.')
    }
    return await next()
  },
  handler: async (args, ctx) => {
    const runbooks = await ctx.query(api.runbooks.searchPublic, { term: args.term })
    return ctx.ok({ runbooks }, `Found ${runbooks.length} public match${runbooks.length === 1 ? '' : 'es'}.`)
  },
})
