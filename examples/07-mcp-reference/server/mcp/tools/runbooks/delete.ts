import { executeOperationRef, previewOperationRef } from '@lupinum/trellis/backend'

import { api } from '~/convex/_generated/api'
import { removeRunbookDescriptor } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

export default tool.operation(removeRunbookDescriptor, {
  execute: executeOperationRef(removeRunbookDescriptor, api.features.runbooks.domain.remove),
  preview: previewOperationRef(
    removeRunbookDescriptor,
    api.features.runbooks.operations.previewRemove,
  ),
  previewOperation: 'mutation',
  group: 'workspace',
  meta: {
    name: 'delete-runbook',
  },
})
