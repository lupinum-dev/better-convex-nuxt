import { defineFeature } from '@lupinum/trellis/feature'

import { projectPermissions } from './permissions'
import { projectTables } from './schema'

export const projectsFeature = defineFeature({
  name: 'projects',
  schema: projectTables,
  permissions: projectPermissions,
})
