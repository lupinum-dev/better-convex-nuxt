import { executeOperationRef, previewOperationRef } from '@lupinum/trellis/backend'

import { api } from '~/convex/_generated/api'
import { bulkRemoveRunbooksDescriptor } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

export default tool.operation(bulkRemoveRunbooksDescriptor, {
  execute: executeOperationRef(
    bulkRemoveRunbooksDescriptor,
    api.features.runbooks.domain.bulkRemove,
  ),
  preview: previewOperationRef(
    bulkRemoveRunbooksDescriptor,
    api.features.runbooks.operations.previewBulkRemove,
  ),
  previewOperation: 'mutation',
  group: 'workspace',
  tags: ['bulk', 'dangerous'],
  meta: {
    name: 'bulk-delete-runbooks',
  },
  rateLimit: { max: 5, window: '1m' },
  maxItems: { field: 'ids', limit: 10 },
})
