/**
 * Permission Composable
 *
 * Uses createPermissions() from the module, then extends with
 * playground-specific features like auto-user-creation.
 */

import { createPermissions } from '#imports'
import { watchEffect } from 'vue'

import { api } from '~/convex/_generated/api'
import { checkPermission, type Permission, type Resource } from '~/convex/permissions.config'

// Re-export types for convenience
export type { Permission, Resource }

// ============================================
// CREATE BASE COMPOSABLES FROM MODULE
// ============================================

const { usePermissions: useBasePermissions, usePermissionGuard: basePermissionGuard } =
  createPermissions<Permission>({
    query: api.auth.getPermissionContext,
    checkPermission,
  })

// ============================================
// EXTENDED USE PERMISSIONS
// ============================================
// Wraps the base composable with auto-user-creation for the playground.
//
// Usage:
//   const { can, user, isAuthenticated, isLoading } = usePermissions()
//
//   // In template:
//   <button v-if="can('post.update', post)">Edit</button>

export function usePermissions() {
  const base = useBasePermissions()

  // ----------------------------------------
  // Auto-create user if needed (playground-specific)
  // ----------------------------------------
  // If user has identity but doesn't exist in DB, create them.
  // This is useful for testing flows where users sign in but
  // haven't been created in the database yet.

  const createUser = useConvexMutation(api.auth.createUserIfNeeded)

  watchEffect(async () => {
    if (base.isLoading.value) return
    const context = base.user.value as any
    const debugInfo = context?._debug
    // If user has identity but not in DB, create them
    if (
      debugInfo?.hasIdentity &&
      !debugInfo?.hasUser &&
      debugInfo?.reason === 'user not found in DB, needs to be created'
    ) {
      try {
        await createUser({})
        // Query will automatically re-run and pick up the new user
      } catch (e) {
        console.error('Failed to create user:', e)
      }
    }
  })

  // Return base API (no extra helpers needed for playground)
  return base
}

// ============================================
// USE PERMISSION GUARD
// ============================================
// Re-export with custom login path for playground.
//
// Usage:
//   usePermissionGuard('org.settings', '/dashboard')

export function usePermissionGuard(
  permission: Permission,
  redirectTo: string = '/',
  resource?: Resource,
) {
  return basePermissionGuard({
    permission,
    redirectTo,
    resource,
    loginPath: '/auth/signin',
  })
}
