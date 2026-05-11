import { defineFeature } from '@lupinum/trellis/workspace'

import { membershipPermissions } from './permissions'
import { membershipTables } from './schema'

export const membershipsFeature = defineFeature({
  name: 'memberships',
  schema: membershipTables,
  permissions: membershipPermissions,
})
