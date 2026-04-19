import { remove } from '~/convex/domain/runbooks'
import { previewRemove, removeRunbookOp } from '~/convex/operations/runbooks'
import { runbookDelete } from '~/convex/auth/permissions'

import { tool } from '../../runtime'

export default tool.fromOperation(removeRunbookOp, {
  execute: remove,
  preview: previewRemove,
  permission: runbookDelete,
  group: 'workspace',
  meta: {
    name: 'delete-runbook',
  },
})
