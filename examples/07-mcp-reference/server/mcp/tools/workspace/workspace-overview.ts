import { z } from 'zod'

import { api } from '#trellis/api'
import { defineTool } from '#trellis/mcp'
import { listRunbooks } from '~/shared/schemas/runbook'

export default defineTool({
  name: 'workspace-overview',
  schema: listRunbooks,
  auth: 'required',
  scoped: true,
  group: 'workspace',
  operation: 'query',
  outputSchema: {
    total: z.number(),
    public: z.number(),
    workspaceOnly: z.number(),
    drafts: z.number(),
    recentTitles: z.array(z.string()),
  },
  handler: async (_args, ctx) => {
    const overview = await ctx.query(api.runbooks.workspaceOverview, {})
    return ctx.ok(
      overview,
      `Workspace has ${overview.total} runbook${overview.total === 1 ? '' : 's'}.`,
    )
  },
})
