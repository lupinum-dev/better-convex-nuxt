import { defineFeature } from '@lupinum/trellis/workspace'

import { commentPermissions } from './permissions'
import { commentTables } from './schema'

export const commentsFeature = defineFeature({
  name: 'comments',
  schema: commentTables,
  permissions: commentPermissions,
})
