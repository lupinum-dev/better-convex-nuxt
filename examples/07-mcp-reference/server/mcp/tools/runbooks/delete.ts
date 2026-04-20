import { remove } from '~/convex/features/runbooks/domain'
import { previewRemove, removeRunbookOp } from '~/convex/features/runbooks/operations'
import { runbookDelete } from '~/convex/features/runbooks/permissions'

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
