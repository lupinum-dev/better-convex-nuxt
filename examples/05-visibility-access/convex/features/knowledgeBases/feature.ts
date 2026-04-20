import { defineFeature } from '@lupinum/trellis/feature'

import { knowledgeBasePermissions } from './permissions'
import { knowledgeBaseTables } from './schema'

export const knowledgeBasesFeature = defineFeature({
  name: 'knowledgeBases',
  schema: knowledgeBaseTables,
  permissions: knowledgeBasePermissions,
})
