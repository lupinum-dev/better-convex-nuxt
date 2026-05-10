import { z } from 'zod'

import { api } from '#trellis/api'
import { runbookRead } from '~/convex/features/runbooks/permissions'
import { listRunbooks } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

export default tool.query({
  schema: listRunbooks,
  call: api.features.runbooks.domain.workspaceOverview,
  permission: runbookRead,
  group: 'workspace',
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
