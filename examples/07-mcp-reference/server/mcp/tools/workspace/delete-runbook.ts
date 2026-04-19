import { api } from '~/convex/_generated/api'
import { runbookDelete } from '~/convex/auth/permissions'
import { removeRunbookOp } from '~/convex/operations/runbooks'

import { tool } from '../../runtime'

export default tool.fromOperation(removeRunbookOp, {
  execute: api.domain.runbooks.remove,
  preview: api.operations.runbooks.previewRemove,
  permission: runbookDelete,
  group: 'workspace',
  meta: {
    name: 'delete-runbook',
  },
})
