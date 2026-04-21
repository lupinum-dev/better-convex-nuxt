import { executeOperationRef, previewOperationRef } from '@lupinum/trellis/functions'

import { bulkRemove } from '~/convex/features/runbooks/domain'
import { bulkRemoveRunbooksOp, previewBulkRemove } from '~/convex/features/runbooks/operations'
import { runbookBulkDelete } from '~/convex/features/runbooks/permissions'

import { tool } from '../../runtime'

export default tool.fromOperation(bulkRemoveRunbooksOp, {
  execute: executeOperationRef(bulkRemoveRunbooksOp, bulkRemove),
  preview: previewOperationRef(bulkRemoveRunbooksOp, previewBulkRemove),
  permission: runbookBulkDelete,
  group: 'workspace',
  tags: ['bulk', 'dangerous'],
  meta: {
    name: 'bulk-delete-runbooks',
  },
  rateLimit: { max: 5, window: '1m' },
  maxItems: { field: 'ids', limit: 10 },
})
