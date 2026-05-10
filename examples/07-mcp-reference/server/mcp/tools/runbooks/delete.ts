import { executeOperationRef, previewOperationRef } from '@lupinum/trellis/functions'

import { remove } from '~/convex/features/runbooks/domain'
import { previewRemove, removeRunbookOp } from '~/convex/features/runbooks/operations'
import { runbookDelete } from '~/convex/features/runbooks/permissions'

import { tool } from '../../runtime'

export default tool.operation(removeRunbookOp, {
  execute: executeOperationRef(removeRunbookOp, remove),
  preview: previewOperationRef(removeRunbookOp, previewRemove),
  permission: runbookDelete,
  group: 'workspace',
  meta: {
    name: 'delete-runbook',
  },
})
