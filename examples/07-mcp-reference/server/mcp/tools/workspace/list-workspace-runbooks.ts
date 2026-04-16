import { api } from '#trellis/api'
import { listRunbooks } from '~/shared/schemas/runbook'

import { tool } from '../../runtime'

export default tool({
  schema: listRunbooks,
  call: api.runbooks.listWorkspace,
  capability: 'readWorkspaceRunbooks',
  group: 'workspace',
  operation: 'query',
  meta: {
    name: 'list-workspace-runbooks',
  },
})
