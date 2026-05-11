import { defineFeature } from '@lupinum/trellis/workspace'

import { knowledgeBasePermissions } from './permissions'
import { knowledgeBaseTables } from './schema'

export const knowledgeBasesFeature = defineFeature({
  name: 'knowledgeBases',
  schema: knowledgeBaseTables,
  permissions: knowledgeBasePermissions,
})
