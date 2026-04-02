import { defineTool } from '#trellis/mcp'
import { api } from '#trellis/api'
import { listRunbooks } from '~/shared/schemas/runbook'

export default defineTool({
  name: 'list-public-runbooks',
  schema: listRunbooks,
  group: 'public',
  tags: ['read-only', 'public'],
  operation: 'query',
  handler: async (_args, ctx) => {
    const runbooks = await ctx.query(api.runbooks.listPublic, {})
    return ctx.ok(
      { runbooks },
      `Found ${runbooks.length} public runbook${runbooks.length === 1 ? '' : 's'}.`,
    )
  },
})
