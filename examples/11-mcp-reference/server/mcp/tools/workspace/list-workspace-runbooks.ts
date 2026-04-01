import { defineTool } from '#convex/mcp'

import { api } from '~/convex/_generated/api'
import { listRunbooks } from '~/shared/schemas/runbook'

export default defineTool({
  name: 'list-workspace-runbooks',
  schema: listRunbooks,
  auth: 'required',
  scoped: true,
  group: 'workspace',
  operation: 'query',
  handler: async (_args, ctx) => {
    const runbooks = await ctx.query(api.runbooks.listWorkspace, {})
    return ctx.ok({ runbooks }, `Loaded ${runbooks.length} workspace runbook${runbooks.length === 1 ? '' : 's'}.`)
  },
})
