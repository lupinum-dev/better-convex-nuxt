import { defineFeature } from '@lupinum/trellis/feature'

import { workspaceTables } from './schema'

export const workspacesFeature = defineFeature({
  name: 'workspaces',
  schema: workspaceTables,
  globalTables: ['workspaces'],
})
