import { defineFeature } from '@lupinum/trellis/workspace'

import {
  bulkRemoveRunbooksDescriptor,
  removeRunbookDescriptor,
} from '../../../shared/features/runbooks/contract'
import { runbookPermissions } from './permissions'
import { runbookTables } from './schema'

export const runbooksFeature = defineFeature({
  name: 'runbooks',
  schema: runbookTables,
  permissions: runbookPermissions,
  operations: [removeRunbookDescriptor, bulkRemoveRunbooksDescriptor],
})
