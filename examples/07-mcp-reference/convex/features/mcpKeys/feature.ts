import { defineFeature } from '@lupinum/trellis/feature'

import { mcpKeyPermissions } from './permissions'
import { mcpKeyTables } from './schema'

export const mcpKeysFeature = defineFeature({
  name: 'mcpKeys',
  schema: mcpKeyTables,
  permissions: mcpKeyPermissions,
})
