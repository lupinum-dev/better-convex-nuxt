/**
 * Why this file exists:
 * Frontend permission checks should read from the exact same permission config the backend uses.
 * This gives autocomplete for `can('todo.update', todo)` and keeps role logic out of components.
 */
import { createPermissions } from 'better-convex-nuxt/composables'

import { api } from '~/convex/_generated/api'
import { permissionConfig } from '~/convex/permissions.config'

export const { usePermissions, usePermissionGuard } = createPermissions({
  query: api.organizations.getPermissionContext,
  checkPermission: permissionConfig.checkPermission,
})
