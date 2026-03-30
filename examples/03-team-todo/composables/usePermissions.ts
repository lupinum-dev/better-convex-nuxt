/**
 * Why this file exists:
 * Frontend permission checks should read from the exact same permission config the backend uses.
 * This tiny app-local file exists so Nuxt can auto-import `usePermissions()` everywhere else.
 * The factory stays here; the rest of the app only sees the finished composable.
 */
import { createPermissions } from 'better-convex-nuxt/composables'

import { api } from '~/convex/_generated/api'
import { permissionConfig } from '~/convex/permissions.config'

export const { usePermissions, usePermissionGuard } = createPermissions({
  query: api.organizations.getPermissionContext,
  checkPermission: permissionConfig.checkPermission,
})
