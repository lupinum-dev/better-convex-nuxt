import { defineFeature } from '@lupinum/trellis/feature'

import { userTables } from './schema'

export const usersFeature = defineFeature({
  name: 'users',
  schema: userTables,
  globalTables: ['users'],
})
