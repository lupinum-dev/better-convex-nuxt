import { api } from '#trellis/api'
import { runbookRead } from '~/convex/features/runbooks/permissions'
import { listRunbooks } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

export default tool({
  schema: listRunbooks,
  call: api.features.runbooks.domain.listWorkspace,
  permission: runbookRead,
  group: 'workspace',
  operation: 'query',
  meta: {
    name: 'list-workspace-runbooks',
  },
})
