import { defineFeature } from '@lupinum/trellis/feature'

import { membershipPermissions } from './permissions'
import { membershipTables } from './schema'

export const membershipsFeature = defineFeature({
  name: 'memberships',
  schema: membershipTables,
  permissions: membershipPermissions,
})
