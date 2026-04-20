import { defineFeature } from '@lupinum/trellis/feature'

import { commentPermissions } from './permissions'
import { commentTables } from './schema'

export const commentsFeature = defineFeature({
  name: 'comments',
  schema: commentTables,
  permissions: commentPermissions,
})
