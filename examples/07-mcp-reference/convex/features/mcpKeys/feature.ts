import { defineFeature } from '@lupinum/trellis/workspace'

import { mcpKeyPermissions } from './permissions'
import { mcpKeyTables } from './schema'

export const mcpKeysFeature = defineFeature({
  name: 'mcpKeys',
  schema: mcpKeyTables,
  permissions: mcpKeyPermissions,
})
