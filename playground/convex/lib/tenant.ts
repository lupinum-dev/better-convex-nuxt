import { createTenantHelpers } from '../../../src/runtime/tenant'

import { query, mutation } from '../_generated/server'
import { checkPermission, type Permission } from '../permissions.config'
import tenantConfig from '../tenant.config'

export const {
  scopedQuery,
  scopedMutation,
} = createTenantHelpers<Permission>(tenantConfig, {
  checkPermission,
  query,
  mutation,
})
