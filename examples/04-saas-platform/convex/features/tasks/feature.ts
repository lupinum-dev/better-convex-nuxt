import { defineFeature } from '@lupinum/trellis/workspace'

import { taskPermissions } from './permissions'
import { taskTables } from './schema'

export const tasksFeature = defineFeature({
  name: 'tasks',
  schema: taskTables,
  permissions: taskPermissions,
})
