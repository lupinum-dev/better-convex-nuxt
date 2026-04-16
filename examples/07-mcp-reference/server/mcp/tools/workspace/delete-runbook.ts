import { api } from '#trellis/api'
import { deleteRunbook } from '~/shared/schemas/runbook'

import { tool } from '../../runtime'

export default tool({
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
