import { z } from 'zod'

import { api } from '#trellis/api'
import { listRunbooks } from '~/shared/schemas/runbook'

import { tool } from '../../runtime'

export default tool({
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
