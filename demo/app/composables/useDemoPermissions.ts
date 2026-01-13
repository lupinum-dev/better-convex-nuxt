/**
 * Demo Permissions Composable
 *
 * Wraps the module's createPermissions() with demo-specific configuration.
 */

import { createPermissions } from '#imports'
import { api } from '@@/convex/_generated/api'
import { checkPermission, type Permission, type Resource } from '@@/convex/permissions.config'

// Re-export types
export type { Permission, Resource }

// Create base composables from module
const { usePermissions: useBasePermissions, usePermissionGuard: basePermissionGuard }
  = createPermissions<Permission>({
    query: api.auth.getPermissionContext,
    checkPermission: checkPermission as any
  })

/**
 * Access permission context and check permissions
 *
 * @example
 * ```vue
 * <script setup>
 * const { can, user, role, isAuthenticated, isLoading } = useDemoPermissions()
 * </script>
 *
 * <template>
 *   <button v-if="can('feed.create')">Create Post</button>
 *   <span>Current role: {{ role }}</span>
 * </template>
 * ```
 */
export function useDemoPermissions() {
  return useBasePermissions()
}

/**
 * Guard a route with permission check
 *
 * @example
 * ```vue
 * <script setup>
 * // Redirect to /demo if user doesn't have admin.settings permission
 * usePermissionGuard('admin.settings', '/demo')
 * </script>
 * ```
 */
export function usePermissionGuard(
  permission: Permission,
  redirectTo: string = '/demo',
  resource?: any
) {
  return basePermissionGuard({
    permission,
    redirectTo,
    resource,
    loginPath: '/'
  })
}
