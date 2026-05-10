import { api } from '#trellis/api'
import { runbookRead } from '~/convex/features/runbooks/permissions'
import { listRunbooks } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

export default tool.query({
  schema: listRunbooks,
  call: api.features.runbooks.domain.listWorkspace,
  permission: runbookRead,
  group: 'workspace',
  meta: {
    name: 'list-workspace-runbooks',
  },
})
