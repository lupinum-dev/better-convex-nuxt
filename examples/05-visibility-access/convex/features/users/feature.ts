import { defineFeature } from '@lupinum/trellis/workspace'

import { userTables } from './schema'

export const usersFeature = defineFeature({
  name: 'users',
  schema: userTables,
  sharedTables: ['users'],
})
