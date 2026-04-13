import { api } from '#trellis/api'
import { deleteRunbook } from '~/shared/schemas/runbook'
import { projectTool } from '../../runtime'

export default projectTool({
  schema: deleteRunbook,
  call: api.runbooks.remove,
  preview: api.runbooks.previewRemove,
  capability: 'writeWorkspaceRunbooks',
  group: 'workspace',
  meta: {
    name: 'delete-runbook',
    destructive: true,
  },
})
