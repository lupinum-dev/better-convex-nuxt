import { api } from '#trellis/api'
import { runbookRead } from '~/convex/auth/permissions'
import { listRunbooks } from '~/shared/schemas/runbook'

import { tool } from '../../runtime'

export default tool({
  schema: listRunbooks,
  call: api.domain.runbooks.listWorkspace,
  permission: runbookRead,
  group: 'workspace',
  operation: 'query',
  meta: {
    name: 'list-workspace-runbooks',
  },
})
