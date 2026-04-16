import { previewRemove, remove, removeRunbookOp } from '~/convex/runbooks'

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
