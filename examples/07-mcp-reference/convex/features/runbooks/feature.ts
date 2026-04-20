import { defineFeature } from '@lupinum/trellis/feature'

import { runbookPermissions } from './permissions'
import { runbookTables } from './schema'

export const runbooksFeature = defineFeature({
  name: 'runbooks',
  schema: runbookTables,
  permissions: runbookPermissions,
})
