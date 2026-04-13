import { z } from 'zod'

import { api } from '#trellis/api'
import { listRunbooks } from '~/shared/schemas/runbook'

import { projectTool } from '../../runtime'

export default projectTool({
  schema: listRunbooks,
  call: api.runbooks.workspaceOverview,
  capability: 'readWorkspaceRunbooks',
  group: 'workspace',
  operation: 'query',
  outputSchema: {
    total: z.number(),
    public: z.number(),
    workspaceOnly: z.number(),
    drafts: z.number(),
    recentTitles: z.array(z.string()),
  },
  meta: {
    name: 'workspace-overview',
  },
})
