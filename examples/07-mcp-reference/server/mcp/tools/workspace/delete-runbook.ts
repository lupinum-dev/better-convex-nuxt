import { remove } from '~/convex/domain/runbooks'
import { previewRemove, removeRunbookOp } from '~/convex/operations/runbooks'

import { tool } from '../../runtime'

export default tool.fromOperation(removeRunbookOp, {
  execute: remove,
  preview: previewRemove,
  capability: 'writeWorkspaceRunbooks',
  group: 'workspace',
  meta: {
    name: 'delete-runbook',
  },
})
