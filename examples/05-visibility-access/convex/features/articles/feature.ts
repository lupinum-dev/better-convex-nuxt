import { defineFeature } from '@lupinum/trellis/workspace'

import { articlePermissions } from './permissions'
import { articleTables } from './schema'

export const articlesFeature = defineFeature({
  name: 'articles',
  schema: articleTables,
  permissions: articlePermissions,
})
