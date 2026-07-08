/**
 * Permission Composable
 *
 * Uses createPermissions() from the module against the minimal signed-in +
 * ownership context query (the playground has no Better Auth Organization
 * plugin). See convex/permissions.config.ts.
 */

import { api } from '#convex/api'
import { createPermissions } from '#imports'
import {
  checkPermission,
  type Permission,
  type PermissionContext,
  type Resource,
} from '~/convex/permissions.config'

// Re-export types for convenience
export type { Permission, Resource }

// ============================================
// CREATE COMPOSABLES FROM MODULE
// ============================================
//
//   const { can, user, isAuthenticated, pending } = usePermissions()
//   <button v-if="can('post.update', post)">Edit</button>

export const { usePermissions, usePermissionRedirect: baseUsePermissionRedirect } =
  createPermissions<Permission, PermissionContext, Resource>({
    query: api.auth.getPermissionContext,
    checkPermission,
  })

// ============================================
// USE PERMISSION REDIRECT
// ============================================

export function usePermissionRedirect(options: Parameters<typeof baseUsePermissionRedirect>[0]) {
  return baseUsePermissionRedirect({
    loginPath: '/auth/signin',
    ...options,
  })
}
