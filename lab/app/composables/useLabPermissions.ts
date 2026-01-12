/**
 * Lab Permissions Composable
 *
 * Wraps the module's createPermissions() with lab-specific configuration.
 */

import { createPermissions } from '#imports'
import { api } from '~/convex/_generated/api'
import { checkPermission, type Permission, type Resource } from '~/convex/permissions.config'

// Re-export types
export type { Permission, Resource }

// Create base composables from module
const { usePermissions: useBasePermissions, usePermissionGuard: basePermissionGuard } =
  createPermissions<Permission>({
    query: api.auth.getPermissionContext,
    checkPermission
  })

/**
 * Access permission context and check permissions
 *
 * @example
 * ```vue
 * <script setup>
 * const { can, user, role, isAuthenticated, isLoading } = useLabPermissions()
 * </script>
 *
 * <template>
 *   <button v-if="can('feed.create')">Create Post</button>
 *   <span>Current role: {{ role }}</span>
 * </template>
 * ```
 */
export function useLabPermissions() {
  return useBasePermissions()
}

/**
 * Guard a route with permission check
 *
 * @example
 * ```vue
 * <script setup>
 * // Redirect to /labs if user doesn't have admin.settings permission
 * usePermissionGuard('admin.settings', '/labs')
 * </script>
 * ```
 */
export function usePermissionGuard(
  permission: Permission,
  redirectTo: string = '/labs',
  resource?: Resource
) {
  return basePermissionGuard({
    permission,
    redirectTo,
    resource,
    loginPath: '/auth/signin'
  })
}
