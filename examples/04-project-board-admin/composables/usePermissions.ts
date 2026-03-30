/**
 * Why this file exists:
 * Nuxt auto-imports composables from this folder, but the permission config lives in Convex-land.
 * This tiny bridge binds the app-local permission context query to the module's generic factory.
 */
import { createPermissions } from 'better-convex-nuxt/composables'

import { api } from '~/convex/_generated/api'
import { permissionConfig } from '~/convex/permissions.config'

export const { usePermissions, usePermissionGuard } = createPermissions({
  query: api.workspaces.getPermissionContext,
  checkPermission: permissionConfig.checkPermission,
})
