import { api } from '#trellis/api'
import { listRunbooks } from '~/shared/schemas/runbook'
import { projectTool } from '../../runtime'

export default projectTool({
  schema: listRunbooks,
  call: api.runbooks.listWorkspace,
  capability: 'readWorkspaceRunbooks',
  group: 'workspace',
  operation: 'query',
  meta: {
    name: 'list-workspace-runbooks',
  },
})
