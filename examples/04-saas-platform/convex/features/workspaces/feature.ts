import { defineFeature } from '@lupinum/trellis/workspace'

import { workspaceTables } from './schema'

export const workspacesFeature = defineFeature({
  name: 'workspaces',
  schema: workspaceTables,
  sharedTables: ['workspaces'],
})
